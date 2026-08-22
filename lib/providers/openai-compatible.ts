/**
 * OpenAI-Compatible Provider
 * 
 * Handles all providers that use the OpenAI API format with different base URLs.
 * Supports: Mistral, Groq, Together, Perplexity, OpenRouter, xAI, DeepSeek, Qwen
 */

import OpenAI from 'openai';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import {
    AIProvider,
    UnifiedChatRequest,
    UnifiedChatResponse,
    StreamChunk,
    ModelPricing,
    ToolCall,
    TokenUsage,
    splitOpenAICachedTokens,
} from './base';
import { getPricingFromDB } from './pricing';
import { toOpenAIMessages, estimateTokenCount } from './utils';
import { normalizeProviderError } from './errors';
import { safeProviderFetch } from '@/lib/security/outbound-url';

/**
 * Provider configuration with base URLs
 */
export const OPENAI_COMPATIBLE_ENDPOINTS: Record<string, { baseURL: string; name: string }> = {
    mistral: {
        baseURL: 'https://api.mistral.ai/v1',
        name: 'Mistral AI',
    },
    groq: {
        baseURL: 'https://api.groq.com/openai/v1',
        name: 'Groq',
    },
    together: {
        baseURL: 'https://api.together.xyz/v1',
        name: 'Together AI',
    },
    perplexity: {
        baseURL: 'https://api.perplexity.ai',
        name: 'Perplexity',
    },
    openrouter: {
        baseURL: 'https://openrouter.ai/api/v1',
        name: 'OpenRouter',
    },
    xai: {
        baseURL: 'https://api.x.ai/v1',
        name: 'xAI',
    },
    deepseek: {
        baseURL: 'https://api.deepseek.com',
        name: 'DeepSeek',
    },
    qwen: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        name: 'Qwen',
    },
    // Meta and HuggingFace typically go through other providers like Together or OpenRouter
    meta: {
        baseURL: 'https://api.together.xyz/v1', // Meta models via Together
        name: 'Meta AI',
    },
    huggingface: {
        baseURL: 'https://api-inference.huggingface.co/v1/',
        name: 'Hugging Face',
    },
    zai: {
        baseURL: 'https://api.z.ai/api/paas/v4/',
        name: 'Z.AI',
    },
    cerebras: {
        baseURL: 'https://api.cerebras.ai/v1',
        name: 'Cerebras',
    },
    maximo: {
        baseURL: 'https://api.maximoai.co/v1',
        name: 'Maximo AI',
    },
    helix: {
        baseURL: 'https://api.launchverse.app/api/v1',
        name: 'Helix',
    },
    centaur: {
        baseURL: 'https://api.okeymeta.com.ng/v1',
        name: 'Centaur',
    },
};

/**
 * Provider-specific headers required to reach an OpenAI-compatible endpoint.
 *
 * Exported because the vision path builds its own OpenAI client against these
 * same endpoints. Maximo's WAF rule in particular has to be applied wherever a
 * client is constructed, or image requests 403 while chat works fine.
 */
export function openAICompatibleHeaders(providerName: string): Record<string, string> {
    const headers: Record<string, string> = {};

    // OpenRouter requires additional headers
    if (providerName === 'openrouter') {
        headers['HTTP-Referer'] = 'https://cencori.com';
        headers['X-Title'] = 'Cencori';
    }

    // Maximo's WAF blocks the OpenAI SDK's default User-Agent (`OpenAI/NodeJS …`),
    // returning `403 "Your request was blocked."`. Override it so requests pass.
    if (providerName === 'maximo') {
        headers['User-Agent'] = 'Cencori/1.0';
    }

    return headers;
}

/**
 * Generic OpenAI-compatible provider
 * Works with any provider that implements the OpenAI API format
 */
export class OpenAICompatibleProvider extends AIProvider {
    readonly supportsTools = true;
    readonly providerName: string;
    private client: OpenAI;
    private displayName: string;
    private pricingOverride?: ModelPricing;

    constructor(providerName: string, apiKey: string, customBaseURL?: string, pricingOverride?: ModelPricing) {
        super();

        this.providerName = providerName;
        this.pricingOverride = pricingOverride;

        const config = OPENAI_COMPATIBLE_ENDPOINTS[providerName];
        if (!config && !customBaseURL) {
            throw new Error(`Unknown provider: ${providerName}. Provide a customBaseURL.`);
        }

        this.displayName = config?.name || providerName;
        const baseURL = customBaseURL || config.baseURL;

        // Initialize OpenAI client with custom base URL
        this.client = new OpenAI({
            apiKey,
            baseURL,
            fetch: safeProviderFetch,
            timeout: 55_000,
            maxRetries: 0,
            // Some providers need extra headers
            defaultHeaders: this.getDefaultHeaders(providerName),
        });
    }

    /**
     * Get provider-specific headers
     */
    private getDefaultHeaders(providerName: string): Record<string, string> {
        return openAICompatibleHeaders(providerName);
    }

    /**
     * Convert unified tools to OpenAI format
     */
    private toOpenAITools(request: UnifiedChatRequest): ChatCompletionTool[] | undefined {
        return request.tools?.map(t => ({
            type: 'function' as const,
            function: {
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
            },
        }));
    }

    async chat(request: UnifiedChatRequest): Promise<UnifiedChatResponse> {
        const startTime = Date.now();

        try {
            const completion = await this.client.chat.completions.create({
                model: request.model,
                messages: toOpenAIMessages(request.messages) as any,
                temperature: request.temperature ?? 0.7,
                max_tokens: request.maxTokens,
                stream: false,
                user: request.userId,
                tools: this.toOpenAITools(request),
                tool_choice: request.toolChoice as any,
                frequency_penalty: request.frequencyPenalty,
                presence_penalty: request.presencePenalty,
            });

            // Handle usage - some providers may not return it
            const usage = completion.usage || {
                prompt_tokens: estimateTokenCount(request.messages.map(m => m.content).join(' ')),
                completion_tokens: estimateTokenCount(completion.choices[0]?.message?.content || ''),
                total_tokens: 0,
            };
            usage.total_tokens = usage.total_tokens || (usage.prompt_tokens + usage.completion_tokens);

            const pricing = await this.getPricing(request.model);
            // Providers on this wire format that support caching report hits
            // inside prompt_tokens, the same as OpenAI; ones that don't report
            // no cache activity and bill exactly as before.
            const { promptTokens: billablePromptTokens, cached } = splitOpenAICachedTokens(usage);
            const providerCost = this.calculateCost(
                billablePromptTokens,
                usage.completion_tokens,
                pricing,
                cached
            );
            const cencoriCharge = this.applyMarkup(providerCost, pricing.cencoriMarkupPercentage)
                + (pricing.fixedFeePerRequest ?? 0);

            const finishReason = completion.choices[0]?.finish_reason;

            const message = completion.choices[0]?.message;
            const toolCalls: ToolCall[] | undefined = message?.tool_calls?.map(tc => {
                if (tc.type === 'function') {
                    return {
                        id: tc.id,
                        type: 'function' as const,
                        function: {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    };
                }
                return {
                    id: tc.id,
                    type: 'function' as const,
                    function: { name: 'unknown', arguments: '{}' },
                };
            });

            return {
                content: message?.content || '',
                model: completion.model || request.model,
                provider: this.providerName,
                usage: {
                    promptTokens: usage.prompt_tokens,
                    completionTokens: usage.completion_tokens,
                    totalTokens: usage.total_tokens,
                    ...(cached.cacheReadTokens ? { cacheReadTokens: cached.cacheReadTokens } : {}),
                },
                cost: {
                    providerCostUsd: providerCost,
                    cencoriChargeUsd: cencoriCharge,
                    markupPercentage: pricing.cencoriMarkupPercentage,
                },
                latencyMs: Date.now() - startTime,
                finishReason: finishReason === 'stop' || finishReason === 'length' || finishReason === 'content_filter' || finishReason === 'tool_calls'
                    ? finishReason
                    : undefined,
                toolCalls,
            };
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async *stream(request: UnifiedChatRequest): AsyncGenerator<StreamChunk> {
        try {
            const stream = await this.client.chat.completions.create({
                model: request.model,
                messages: toOpenAIMessages(request.messages) as any,
                temperature: request.temperature ?? 0.7,
                max_tokens: request.maxTokens,
                stream: true,
                user: request.userId,
                tools: this.toOpenAITools(request),
                tool_choice: request.toolChoice as any,
                frequency_penalty: request.frequencyPenalty,
                presence_penalty: request.presencePenalty,
            });

            // Track tool calls across chunks (they stream incrementally)
            const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                const finishReason = chunk.choices[0]?.finish_reason;
                const toolCallDeltas = chunk.choices[0]?.delta?.tool_calls;

                // Read usage if the provider volunteers it, but don't request
                // it with stream_options: this adapter fronts a dozen vendors
                // and an unrecognised parameter would fail the whole stream.
                // Providers that stay silent keep the gateway's estimate.
                let usage: TokenUsage | undefined;
                if (chunk.usage) {
                    const { promptTokens, cached } = splitOpenAICachedTokens(chunk.usage);
                    usage = {
                        promptTokens,
                        completionTokens: chunk.usage.completion_tokens ?? 0,
                        totalTokens: chunk.usage.total_tokens ?? 0,
                        ...(cached.cacheReadTokens ? { cacheReadTokens: cached.cacheReadTokens } : {}),
                    };
                }

                if (toolCallDeltas) {
                    for (const tc of toolCallDeltas) {
                        const existing = toolCallsInProgress.get(tc.index);
                        if (existing) {
                            if (tc.function?.arguments) {
                                existing.arguments += tc.function.arguments;
                            }
                        } else {
                            toolCallsInProgress.set(tc.index, {
                                id: tc.id || '',
                                name: tc.function?.name || '',
                                arguments: tc.function?.arguments || '',
                            });
                        }
                    }
                }

                let toolCalls: ToolCall[] | undefined;
                if (finishReason === 'tool_calls' && toolCallsInProgress.size > 0) {
                    toolCalls = Array.from(toolCallsInProgress.values()).map(tc => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: {
                            name: tc.name,
                            arguments: tc.arguments,
                        },
                    }));
                }

                yield {
                    delta,
                    finishReason: finishReason === 'tool_calls' ? 'tool_calls'
                        : finishReason === 'stop' || finishReason === 'length' || finishReason === 'content_filter'
                            ? finishReason
                            : undefined,
                    toolCalls,
                    ...(usage ? { usage } : {}),
                };
            }
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async countTokens(text: string, _model?: string): Promise<number> {
        // Use rough estimation for OpenAI-compatible providers
        return estimateTokenCount(text);
    }

    async getPricing(model: string): Promise<ModelPricing> {
        return this.pricingOverride || getPricingFromDB(this.providerName, model);
    }

    async testConnection(): Promise<boolean> {
        try {
            // Try to list models - most providers support this
            await this.client.models.list();
            return true;
        } catch {
            // Some providers don't support model listing, try a minimal chat
            try {
                await this.client.chat.completions.create({
                    model: 'gpt-3.5-turbo', // Fallback model, may not work
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 1,
                });
                return true;
            } catch {
                return false;
            }
        }
    }
}

/**
 * Factory function to create provider instances
 */
export function createOpenAICompatibleProvider(
    providerName: string,
    apiKey: string
): OpenAICompatibleProvider {
    return new OpenAICompatibleProvider(providerName, apiKey);
}

/**
 * Check if a provider is OpenAI-compatible
 */
export function isOpenAICompatible(providerName: string): boolean {
    return providerName in OPENAI_COMPATIBLE_ENDPOINTS;
}
