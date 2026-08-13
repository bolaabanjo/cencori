/**
 * OpenAI Provider
 * 
 * Implements the AIProvider interface for OpenAI's GPT models
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
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

export class OpenAIProvider extends AIProvider {
    readonly providerName = 'openai';
    readonly supportsTools = true;
    private client: OpenAI;

    constructor(apiKey?: string) {
        super();

        const key = apiKey || process.env.OPENAI_API_KEY;
        if (!key) {
            throw new Error('OpenAI API key is required - either pass it or set OPENAI_API_KEY env var');
        }

        this.client = new OpenAI({
            apiKey: key,
            timeout: 55_000,
            maxRetries: 0,
        });
    }

    async chat(request: UnifiedChatRequest): Promise<UnifiedChatResponse> {
        const startTime = Date.now();

        try {
            // Convert tools to OpenAI format
            const tools: ChatCompletionTool[] | undefined = request.tools?.map(t => ({
                type: 'function' as const,
                function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                },
            }));

            const completion = await this.client.chat.completions.create({
                model: request.model,
                messages: toOpenAIMessages(request.messages) as any,
                temperature: request.temperature ?? 0.7,
                max_tokens: request.maxTokens,
                stream: false,
                user: request.userId,
                tools,
                tool_choice: request.toolChoice as any,
                frequency_penalty: request.frequencyPenalty,
                presence_penalty: request.presencePenalty,
                prompt_cache_key: request.promptCacheKey,
            });

            const usage = completion.usage!;
            const pricing = await this.getPricing(request.model);

            // OpenAI caches automatically above ~1k tokens and counts the hits
            // inside prompt_tokens, so billing that figure charges cache reads
            // at the full input rate — up to 10x the real cost on GPT-5.
            const { promptTokens: billablePromptTokens, cached } = splitOpenAICachedTokens(usage);
            const providerCost = this.calculateCost(
                billablePromptTokens,
                usage.completion_tokens,
                pricing,
                cached
            );

            const cencoriCharge = this.applyMarkup(providerCost, pricing.cencoriMarkupPercentage)
                + (pricing.fixedFeePerRequest ?? 0);

            // Parse finish reason
            const finishReason = completion.choices[0].finish_reason;

            // Parse tool calls if present
            const message = completion.choices[0].message;
            const toolCalls: ToolCall[] | undefined = message.tool_calls?.map(tc => {
                // Handle different tool call types
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
                // For other types, create a placeholder
                return {
                    id: tc.id,
                    type: 'function' as const,
                    function: {
                        name: 'unknown',
                        arguments: '{}',
                    },
                };
            });

            return {
                content: message.content || '',
                model: completion.model,
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
                finishReason: finishReason === 'tool_calls' ? 'tool_calls'
                    : finishReason === 'stop' || finishReason === 'length' || finishReason === 'content_filter'
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
            // Convert tools to OpenAI format
            const tools: ChatCompletionTool[] | undefined = request.tools?.map(t => ({
                type: 'function' as const,
                function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                },
            }));

            const stream = await this.client.chat.completions.create({
                model: request.model,
                messages: toOpenAIMessages(request.messages) as any,
                temperature: request.temperature ?? 0.7,
                max_tokens: request.maxTokens,
                stream: true,
                user: request.userId,
                tools,
                tool_choice: request.toolChoice as any,
                frequency_penalty: request.frequencyPenalty,
                presence_penalty: request.presencePenalty,
                prompt_cache_key: request.promptCacheKey,
                // Without this OpenAI reports no usage on a stream at all, and
                // the gateway has to fall back to estimating tokens from text.
                stream_options: { include_usage: true },
            });

            // Track tool calls across chunks (they stream incrementally)
            const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();

            for await (const chunk of stream) {
                // Usage arrives on a final chunk of its own, after the content
                // is done, with an empty choices array.
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

                const delta = chunk.choices[0]?.delta?.content || '';
                const finishReason = chunk.choices[0]?.finish_reason;
                const toolCallDeltas = chunk.choices[0]?.delta?.tool_calls;

                // Accumulate tool call data
                if (toolCallDeltas) {
                    for (const tc of toolCallDeltas) {
                        const existing = toolCallsInProgress.get(tc.index);
                        if (existing) {
                            // Append to existing tool call
                            if (tc.function?.arguments) {
                                existing.arguments += tc.function.arguments;
                            }
                        } else {
                            // New tool call
                            toolCallsInProgress.set(tc.index, {
                                id: tc.id || '',
                                name: tc.function?.name || '',
                                arguments: tc.function?.arguments || '',
                            });
                        }
                    }
                }

                // Build tool calls array if we have completed calls
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

    async countTokens(text: string, model?: string): Promise<number> {
        // OpenAI doesn't have a direct token counting API
        // Using tiktoken for accurate estimation
        try {
            const { encoding_for_model } = await import('tiktoken');
            const modelName = model || 'gpt-3.5-turbo';
            // Type assertion for tiktoken model names
            const encoding = encoding_for_model(modelName as Parameters<typeof encoding_for_model>[0]);
            const tokens = encoding.encode(text);
            encoding.free();
            return tokens.length;
        } catch (error) {
            // Fallback to rough estimation if tiktoken fails
            console.warn('[OpenAI] Tiktoken failed, using estimation:', error);
            return estimateTokenCount(text);
        }
    }

    async getPricing(model: string): Promise<ModelPricing> {
        return getPricingFromDB('openai', model);
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.client.models.list();
            return true;
        } catch {
            return false;
        }
    }
}
