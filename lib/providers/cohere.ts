/**
 * Cohere Provider
 * 
 * Implements the AIProvider interface for Cohere's Command models.
 * Cohere uses a different API format than OpenAI.
 */

import {
    AIProvider,
    UnifiedChatRequest,
    UnifiedChatResponse,
    StreamChunk,
    ModelPricing,
} from './base';
import { getPricingFromDB } from './pricing';
import { estimateTokenCount } from './utils';
import { normalizeProviderError } from './errors';
import { safeProviderFetch } from '@/lib/security/outbound-url';

interface CohereMessage {
    role: 'USER' | 'CHATBOT' | 'SYSTEM';
    message: string;
}

interface CohereResponse {
    text: string;
    generation_id: string;
    chat_history: CohereMessage[];
    finish_reason: string;
    meta?: {
        api_version: { version: string };
        billed_units?: {
            input_tokens?: number;
            output_tokens?: number;
        };
        tokens?: {
            input_tokens?: number;
            output_tokens?: number;
        };
    };
}

interface CohereStreamEvent {
    event_type: 'stream-start' | 'text-generation' | 'stream-end';
    text?: string;
    finish_reason?: string;
    response?: CohereResponse;
}

export class CohereProvider extends AIProvider {
    readonly providerName = 'cohere';
    private apiKey: string;
    private baseURL = 'https://api.cohere.ai/v1';

    constructor(apiKey: string) {
        super();

        if (!apiKey) {
            throw new Error('Cohere API key is required');
        }

        this.apiKey = apiKey;
    }

    /**
     * Convert unified messages to Cohere format
     */
    private toCohereChatHistory(messages: { role: string; content: string }[]): {
        chatHistory: CohereMessage[];
        message: string;
        preamble?: string;
    } {
        const chatHistory: CohereMessage[] = [];
        let preamble: string | undefined;
        let lastUserMessage = '';

        for (const msg of messages) {
            if (msg.role === 'system') {
                preamble = msg.content;
            } else if (msg.role === 'user') {
                lastUserMessage = msg.content;
                // Don't add to history yet - will be the main message
            } else if (msg.role === 'assistant') {
                // If we have a pending user message, add both
                if (lastUserMessage) {
                    chatHistory.push({ role: 'USER', message: lastUserMessage });
                    lastUserMessage = '';
                }
                chatHistory.push({ role: 'CHATBOT', message: msg.content });
            }
        }

        // The last user message becomes the main message
        return {
            chatHistory,
            message: lastUserMessage || messages[messages.length - 1]?.content || '',
            preamble,
        };
    }

    async chat(request: UnifiedChatRequest): Promise<UnifiedChatResponse> {
        const startTime = Date.now();

        try {
            const { chatHistory, message, preamble } = this.toCohereChatHistory(request.messages);

            const response = await safeProviderFetch(`${this.baseURL}/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    model: request.model,
                    message,
                    chat_history: chatHistory.length > 0 ? chatHistory : undefined,
                    preamble,
                    temperature: request.temperature ?? 0.7,
                    max_tokens: request.maxTokens,
                }),
                signal: AbortSignal.timeout(55_000),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Cohere API error: ${response.status} - ${error}`);
            }

            const data: CohereResponse = await response.json();

            // Extract token usage
            const inputTokens = data.meta?.billed_units?.input_tokens
                || data.meta?.tokens?.input_tokens
                || estimateTokenCount(message);
            const outputTokens = data.meta?.billed_units?.output_tokens
                || data.meta?.tokens?.output_tokens
                || estimateTokenCount(data.text);

            const pricing = await this.getPricing(request.model);
            const providerCost = this.calculateCost(inputTokens, outputTokens, pricing);
            const cencoriCharge = this.applyMarkup(providerCost, pricing.cencoriMarkupPercentage)
                + (pricing.fixedFeePerRequest ?? 0);

            return {
                content: data.text,
                model: request.model,
                provider: this.providerName,
                usage: {
                    promptTokens: inputTokens,
                    completionTokens: outputTokens,
                    totalTokens: inputTokens + outputTokens,
                },
                cost: {
                    providerCostUsd: providerCost,
                    cencoriChargeUsd: cencoriCharge,
                    markupPercentage: pricing.cencoriMarkupPercentage,
                },
                latencyMs: Date.now() - startTime,
                finishReason: data.finish_reason === 'COMPLETE' ? 'stop' : undefined,
            };
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async *stream(request: UnifiedChatRequest): AsyncGenerator<StreamChunk> {
        try {
            const { chatHistory, message, preamble } = this.toCohereChatHistory(request.messages);

            const response = await safeProviderFetch(`${this.baseURL}/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    model: request.model,
                    message,
                    chat_history: chatHistory.length > 0 ? chatHistory : undefined,
                    preamble,
                    temperature: request.temperature ?? 0.7,
                    max_tokens: request.maxTokens,
                    stream: true,
                }),
                signal: AbortSignal.timeout(55_000),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Cohere API error: ${response.status} - ${error}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const event: CohereStreamEvent = JSON.parse(line);

                        if (event.event_type === 'text-generation' && event.text) {
                            yield { delta: event.text };
                        } else if (event.event_type === 'stream-end') {
                            yield {
                                delta: '',
                                finishReason: event.finish_reason === 'COMPLETE' ? 'stop' : undefined,
                            };
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async countTokens(text: string, _model?: string): Promise<number> {
        return estimateTokenCount(text);
    }

    async getPricing(model: string): Promise<ModelPricing> {
        return getPricingFromDB(this.providerName, model);
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await safeProviderFetch(`${this.baseURL}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                signal: AbortSignal.timeout(15_000),
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}
