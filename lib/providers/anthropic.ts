/**
 * Anthropic Provider
 * 
 * Implements the AIProvider interface for Anthropic's Claude models
 */

import Anthropic from '@anthropic-ai/sdk';
import {
    AIProvider,
    UnifiedChatRequest,
    UnifiedChatResponse,
    StreamChunk,
    ModelPricing,
    ToolCall,
} from './base';
import { getPricingFromDB } from './pricing';
import { toAnthropicMessages } from './utils';
import { normalizeProviderError } from './errors';
import { safeProviderFetch } from '@/lib/security/outbound-url';

/**
 * Map Anthropic's stop_reason onto the unified finish reason.
 * `pause_turn` is deliberately unmapped — the turn isn't finished.
 */
function toFinishReason(
    stopReason: string | null | undefined
): StreamChunk['finishReason'] {
    switch (stopReason) {
        case 'end_turn':
        case 'stop_sequence':
            return 'stop';
        case 'max_tokens':
            return 'length';
        case 'tool_use':
            return 'tool_calls';
        case 'refusal':
            return 'content_filter';
        default:
            return undefined;
    }
}

/**
 * Anthropic requires an explicit `type: 'object'` on a tool's input schema.
 * OpenAI does not — it accepts `parameters: {}`, or a schema with only
 * `properties`, which is how no-argument tools are usually written. Normalise
 * rather than forward a schema the API will reject.
 */
function toInputSchema(parameters: Record<string, any> | undefined): Anthropic.Tool.InputSchema {
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
        return { type: 'object', properties: {} };
    }
    if (parameters.type !== 'object') {
        return { ...parameters, type: 'object', properties: parameters.properties ?? {} };
    }
    return parameters as Anthropic.Tool.InputSchema;
}

/**
 * Claude Fable 5.1 and Mythos 5.1 removed forced tool use: `tool_choice` of
 * `any` or `tool` returns a 400 rather than a response. Anthropic's stated
 * migration is `auto` plus an instruction naming the tool, so a request that
 * asks to force a call is downgraded to `auto` instead of being forwarded to a
 * guaranteed rejection — with tools present and a caller who wanted one used,
 * `auto` almost always calls it, whereas the 400 returns nothing at all.
 *
 * Every other Claude model still honours the forced forms, so this is keyed to
 * the affected ids rather than applied across the provider. `none` is
 * unaffected on all models, and `disable_parallel_tool_use` still rides along
 * with `auto`.
 */
function rejectsForcedToolChoice(model: string): boolean {
    return /^claude-(fable|mythos)-5-1\b/.test(model);
}

export class AnthropicProvider extends AIProvider {
    readonly providerName = 'anthropic';
    readonly supportsTools = true;
    private client: Anthropic;
    private pricingOverride?: ModelPricing;

    constructor(apiKey?: string, options?: { baseURL?: string; pricing?: ModelPricing }) {
        super();

        const key = apiKey || process.env.ANTHROPIC_API_KEY;
        if (!key) {
            throw new Error('Anthropic API key is required - either pass it or set ANTHROPIC_API_KEY env var');
        }

        this.client = new Anthropic({
            apiKey: key,
            ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
            ...(options?.baseURL ? { fetch: safeProviderFetch } : {}),
            timeout: 55_000,
            maxRetries: 0,
        });
        this.pricingOverride = options?.pricing;
    }

    /**
     * Anthropic names the JSON Schema `input_schema`, and flattens the
     * `{ type: 'function', function: {...} }` wrapper OpenAI uses.
     */
    private toAnthropicTools(request: UnifiedChatRequest): Anthropic.Tool[] | undefined {
        if (!request.tools || request.tools.length === 0) return undefined;

        return request.tools.map(tool => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: toInputSchema(tool.function.parameters),
        }));
    }

    private toAnthropicToolChoice(
        request: UnifiedChatRequest
    ): Anthropic.ToolChoice | undefined {
        const choice = request.toolChoice;

        // Anthropic expresses "don't parallelise" on the choice, not the
        // request, so opting out without naming a choice still has to send one.
        const disableParallel = request.parallelToolCalls === false
            ? { disable_parallel_tool_use: true }
            : {};

        if (!choice) {
            return request.parallelToolCalls === false && request.tools?.length
                ? { type: 'auto', ...disableParallel }
                : undefined;
        }

        const noForcing = rejectsForcedToolChoice(request.model);

        if (choice === 'auto') return { type: 'auto', ...disableParallel };
        if (choice === 'required') {
            return noForcing
                ? { type: 'auto', ...disableParallel }
                : { type: 'any', ...disableParallel };
        }
        if (choice === 'none') return { type: 'none' };
        if (typeof choice === 'object' && choice.function?.name) {
            return noForcing
                ? { type: 'auto', ...disableParallel }
                : { type: 'tool', name: choice.function.name, ...disableParallel };
        }
        return undefined;
    }

    async chat(request: UnifiedChatRequest): Promise<UnifiedChatResponse> {
        const startTime = Date.now();

        try {
            // Anthropic handles system messages separately
            const { system, messages } = toAnthropicMessages(request.messages);
            const tools = this.toAnthropicTools(request);
            const toolChoice = this.toAnthropicToolChoice(request);

            const response = await this.client.messages.create({
                model: request.model,
                max_tokens: request.maxTokens ?? 4096,
                temperature: request.temperature,
                system,
                messages: messages as Anthropic.MessageParam[],
                ...(tools ? { tools } : {}),
                ...(toolChoice ? { tool_choice: toolChoice } : {}),
            });

            const pricing = await this.getPricing(request.model);
            // Anthropic reports cache reads and writes as fields of their own,
            // excluded from input_tokens — so they have to be billed explicitly
            // or they are billed at nothing.
            const cached = {
                cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
                cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
            };
            const providerCost = this.calculateCost(
                response.usage.input_tokens,
                response.usage.output_tokens,
                pricing,
                cached
            );
            const cencoriCharge = this.applyMarkup(providerCost, pricing.cencoriMarkupPercentage)
                + (pricing.fixedFeePerRequest ?? 0);

            // A response can interleave several blocks — prose plus one
            // tool_use per requested call — so walk all of them rather than
            // assuming the first block is the answer.
            const textParts: string[] = [];
            const toolCalls: ToolCall[] = [];
            for (const block of response.content) {
                if (block.type === 'text') {
                    textParts.push(block.text);
                } else if (block.type === 'tool_use') {
                    toolCalls.push({
                        id: block.id,
                        type: 'function',
                        function: {
                            name: block.name,
                            arguments: JSON.stringify(block.input ?? {}),
                        },
                    });
                }
            }

            return {
                content: textParts.join(''),
                model: response.model,
                provider: this.providerName,
                usage: {
                    promptTokens: response.usage.input_tokens,
                    completionTokens: response.usage.output_tokens,
                    totalTokens: response.usage.input_tokens + response.usage.output_tokens,
                    ...(cached.cacheReadTokens ? { cacheReadTokens: cached.cacheReadTokens } : {}),
                    ...(cached.cacheWriteTokens ? { cacheWriteTokens: cached.cacheWriteTokens } : {}),
                },
                cost: {
                    providerCostUsd: providerCost,
                    cencoriChargeUsd: cencoriCharge,
                    markupPercentage: pricing.cencoriMarkupPercentage,
                },
                latencyMs: Date.now() - startTime,
                finishReason: toFinishReason(response.stop_reason),
                ...(toolCalls.length > 0 ? { toolCalls } : {}),
            };
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async *stream(request: UnifiedChatRequest): AsyncGenerator<StreamChunk> {
        try {
            const { system, messages } = toAnthropicMessages(request.messages);
            const tools = this.toAnthropicTools(request);
            const toolChoice = this.toAnthropicToolChoice(request);

            const stream = await this.client.messages.create({
                model: request.model,
                max_tokens: request.maxTokens ?? 4096,
                temperature: request.temperature,
                system,
                messages: messages as Anthropic.MessageParam[],
                ...(tools ? { tools } : {}),
                ...(toolChoice ? { tool_choice: toolChoice } : {}),
                stream: true,
            });

            // Tool arguments arrive as partial JSON fragments spread across
            // events, keyed by content block index. Nothing is emitted until
            // the model stops, so callers always see complete arguments.
            const toolCallsInProgress = new Map<number, { id: string; name: string; argumentsJson: string }>();

            // Anthropic splits usage across two events: message_start carries
            // the prompt side (including the cache fields, which are excluded
            // from input_tokens), message_delta the running output count.
            let promptTokens = 0;
            let cacheReadTokens = 0;
            let cacheWriteTokens = 0;
            let completionTokens = 0;

            for await (const event of stream) {
                if (event.type === 'message_start') {
                    const usage = event.message.usage;
                    promptTokens = usage.input_tokens ?? 0;
                    cacheReadTokens = usage.cache_read_input_tokens ?? 0;
                    cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
                    completionTokens = usage.output_tokens ?? 0;
                }
                if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
                    toolCallsInProgress.set(event.index, {
                        id: event.content_block.id,
                        name: event.content_block.name,
                        argumentsJson: '',
                    });
                }
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                    yield {
                        delta: event.delta.text,
                    };
                }
                if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
                    const inProgress = toolCallsInProgress.get(event.index);
                    if (inProgress) {
                        inProgress.argumentsJson += event.delta.partial_json;
                    }
                }
                if (event.type === 'message_delta') {
                    // Cumulative, not incremental — assign rather than add.
                    completionTokens = event.usage?.output_tokens ?? completionTokens;
                    const finishReason = toFinishReason(event.delta.stop_reason);
                    const toolCalls: ToolCall[] | undefined = toolCallsInProgress.size > 0
                        ? Array.from(toolCallsInProgress.values()).map(call => ({
                            id: call.id,
                            type: 'function' as const,
                            function: {
                                name: call.name,
                                // A no-argument tool streams no deltas at all.
                                arguments: call.argumentsJson || '{}',
                            },
                        }))
                        : undefined;
                    yield {
                        delta: '',
                        finishReason,
                        ...(toolCalls ? { toolCalls } : {}),
                        usage: {
                            promptTokens,
                            completionTokens,
                            totalTokens: promptTokens + cacheReadTokens + cacheWriteTokens
                                + completionTokens,
                            ...(cacheReadTokens ? { cacheReadTokens } : {}),
                            ...(cacheWriteTokens ? { cacheWriteTokens } : {}),
                        },
                    };
                }
            }
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async countTokens(text: string, model?: string): Promise<number> {
        try {
            // Anthropic has a count_tokens beta API
            const response = await this.client.messages.countTokens({
                model: model || 'claude-3-haiku-20240307',
                messages: [{ role: 'user', content: text }],
            });
            return response.input_tokens;
        } catch (error) {
            // Fallback to estimation if API fails
            console.warn('[Anthropic] Token counting failed, using estimation:', error);
            return Math.ceil(text.length / 4);
        }
    }

    async getPricing(model: string): Promise<ModelPricing> {
        return this.pricingOverride || getPricingFromDB('anthropic', model);
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.countTokens('test', 'claude-3-haiku-20240307');
            return true;
        } catch {
            return false;
        }
    }
}
