/**
 * Base Provider Interface and Types
 * 
 * This file defines the core abstraction layer for all AI providers.
 * All provider implementations (OpenAI, Anthropic, Gemini, Custom) must implement this interface.
 */

/**
 * An image that travels beside a message's text.
 *
 * `url` is either an https URL or a `data:` URL carrying base64 bytes, which is what an agent's
 * image tool returns.
 */
export interface UnifiedImagePart {
    url: string;
    detail?: 'auto' | 'low' | 'high';
}

/**
 * Unified message format across all providers
 *
 * `content` stays a string on purpose: every consumer of it — the security pipeline, custom data
 * rules, masking, token estimation, request logging — reads text. Images ride alongside in
 * `images` so a multimodal turn reaches vision-capable providers without any of those having to
 * learn a second content shape. Providers that cannot take images ignore the field, which leaves
 * them with exactly the text they received before.
 */
export interface UnifiedMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    /** Images accompanying this turn, for providers that accept them. */
    images?: UnifiedImagePart[];
    /** Tool call ID (for tool role messages) */
    toolCallId?: string;
    /** Tool calls made by the model (for assistant role messages) */
    tool_calls?: ToolCall[];
}

/**
 * Tool function definition (OpenAI-compatible format)
 */
export interface ToolFunction {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
}

/**
 * Tool definition wrapper
 */
export interface Tool {
    type: 'function';
    function: ToolFunction;
    needsApproval?: boolean;
}

/**
 * Tool call from the model
 */
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

/**
 * Unified chat request
 */
export interface UnifiedChatRequest {
    messages: UnifiedMessage[];
    model: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    userId?: string;
    /** Tools available to the model */
    tools?: Tool[];
    /** Control tool usage: 'auto' | 'none' | 'required' | specific tool */
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
    /** Context truncation strategy: 'auto' truncates old messages, 'disabled' fails on overflow */
    truncation?: 'auto' | 'disabled';
    /** Whether to allow parallel tool calls (default: true) */
    parallelToolCalls?: boolean;
    frequencyPenalty?: number;
    presencePenalty?: number;
    /** Stable provider-side prefix-cache routing key when supported. */
    promptCacheKey?: string;
}

/**
 * Token usage information
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /**
     * Prompt tokens the provider served from, or wrote to, its own cache.
     * Reported alongside rather than folded into `promptTokens`, which stays
     * the count billed at the full input rate — anything that re-derives cost
     * from `promptTokens` would otherwise double-bill them.
     */
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}

/**
 * Cost breakdown for a request
 */
export interface CostBreakdown {
    providerCostUsd: number;     // Actual cost from provider
    cencoriChargeUsd: number;    // Amount we charge the customer
    markupPercentage: number;    // Markup applied
}

/**
 * Unified chat response
 */
export interface UnifiedChatResponse {
    content: string;
    model: string;
    provider: string;
    usage: TokenUsage;
    cost: CostBreakdown;
    latencyMs: number;
    finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';
    /** Tool calls requested by the model */
    toolCalls?: ToolCall[];
}

/**
 * Streaming chunk
 */
export interface StreamChunk {
    delta: string;
    /**
     * Chain-of-thought tokens, for providers that stream them on a field of their own
     * (`delta.reasoning_content` in the DeepSeek/GLM dialect) rather than inside `delta.content`.
     *
     * Kept separate because it is not the answer: a consumer that concatenated it into `delta`
     * would put the model's thinking in the user's reply. Reading it at all is what stops a
     * reasoning model looking frozen — it thinks for tens of seconds before the first content
     * token, and every one of those tokens used to be dropped here.
     */
    reasoningDelta?: string;
    finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
    /** Error message if the stream encountered an error */
    error?: string;
    /** Tool calls in this chunk (streamed incrementally) */
    toolCalls?: ToolCall[];
    /**
     * Final token usage, emitted once on the terminal chunk by adapters whose
     * provider reports it. Absent on every earlier chunk, and absent entirely
     * for adapters that cannot report usage — consumers must treat it as
     * optional rather than assuming the last chunk carries it.
     */
    usage?: TokenUsage;
}

/**
 * Model pricing information
 */
export interface ModelPricing {
    inputPer1KTokens: number;
    outputPer1KTokens: number;
    cencoriMarkupPercentage: number;
    /** Discounted provider rate for cached prompt tokens, when reported. */
    cachedInputPer1KTokens?: number;
    /**
     * Multiplier on the input rate for tokens written to a provider-side cache.
     * Anthropic charges 1.25x the base input rate for a 5-minute cache write
     * (2x for the 1-hour TTL, which nothing here requests). Providers that do
     * not charge a write premium leave this unset and bill writes as input.
     */
    cacheWriteMultiplier?: number;
    /** Prompt-token count above which the long-context rates apply. */
    longContextThresholdTokens?: number;
    longContextInputPer1KTokens?: number;
    longContextOutputPer1KTokens?: number;
    longContextCachedInputPer1KTokens?: number;
    /** Review deadline for temporary/promotional pricing. */
    pricingExpiresAt?: string;
    /** Optional fixed platform fee charged once per provider request. */
    fixedFeePerRequest?: number;
}

/**
 * Prompt tokens a provider served from, or wrote to, its own prompt cache.
 * Reported separately from the uncached prompt count because providers price
 * them differently — and because providers disagree on whether they are part
 * of the headline prompt-token figure. Anthropic excludes them from
 * `input_tokens`; OpenAI counts cache reads inside `prompt_tokens`.
 */
export interface CachedTokenUsage {
    /** Prompt tokens served from cache, billed at the discounted cache rate. */
    cacheReadTokens?: number;
    /** Prompt tokens written to cache, billed at a premium over the input rate. */
    cacheWriteTokens?: number;
}

/**
 * Split an OpenAI-shaped usage object into billable and cached prompt tokens.
 *
 * OpenAI counts cache reads *inside* `prompt_tokens` and breaks them out under
 * `prompt_tokens_details.cached_tokens`, so billing the headline figure charges
 * cached tokens at the full input rate. Providers on the OpenAI-compatible
 * wire format that omit the details object simply report no cache activity,
 * which yields the original prompt count unchanged.
 *
 * OpenAI does not charge a premium for cache writes, so there is no write
 * component to separate out here.
 */
export function splitOpenAICachedTokens(usage: {
    prompt_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number | null } | null;
}): { promptTokens: number; cached: CachedTokenUsage } {
    const promptTokens = Math.max(0, Number(usage.prompt_tokens) || 0);
    const reported = Math.max(0, Number(usage.prompt_tokens_details?.cached_tokens) || 0);
    // Never let a bogus cache count drive the billable remainder negative.
    const cacheReadTokens = Math.min(reported, promptTokens);
    return {
        promptTokens: promptTokens - cacheReadTokens,
        cached: { cacheReadTokens },
    };
}

/**
 * Calculate provider token cost, including request-wide long-context tiers.
 *
 * `promptTokens` is the count of prompt tokens billed at the full input rate —
 * i.e. NOT served from or written to a provider cache. Adapters whose provider
 * folds cached tokens into its headline prompt count must subtract them before
 * calling; passing them twice double-bills. Omitting `cached` entirely bills
 * every prompt token at the input rate, which is the correct behaviour for
 * providers that report no cache activity.
 */
export function calculateProviderTokenCost(
    promptTokens: number,
    completionTokens: number,
    pricing: ModelPricing,
    cached?: CachedTokenUsage
): number {
    const safe = (value: number | undefined) => Math.max(0, Number(value) || 0);
    const safePromptTokens = safe(promptTokens);
    const safeCompletionTokens = safe(completionTokens);
    const cacheReadTokens = safe(cached?.cacheReadTokens);
    const cacheWriteTokens = safe(cached?.cacheWriteTokens);

    // Providers tier on the size of the whole request, so the threshold has to
    // see cached tokens too — they occupy the context window like any other.
    const totalPromptTokens = safePromptTokens + cacheReadTokens + cacheWriteTokens;
    const useLongContext = pricing.longContextThresholdTokens !== undefined
        && totalPromptTokens > pricing.longContextThresholdTokens;
    const inputRate = useLongContext
        ? pricing.longContextInputPer1KTokens
        : pricing.inputPer1KTokens;
    const outputRate = useLongContext
        ? pricing.longContextOutputPer1KTokens
        : pricing.outputPer1KTokens;

    if (inputRate === undefined || outputRate === undefined) {
        throw new Error('Long-context pricing is incomplete');
    }

    // Fail toward the input rate rather than toward zero: an unpriced cache
    // read is a rate we do not know, not a token we were given for free.
    const cacheReadRate = (useLongContext
        ? pricing.longContextCachedInputPer1KTokens ?? pricing.cachedInputPer1KTokens
        : pricing.cachedInputPer1KTokens) ?? inputRate;
    const cacheWriteRate = inputRate * (pricing.cacheWriteMultiplier ?? 1);

    return (safePromptTokens / 1000) * inputRate
        + (cacheReadTokens / 1000) * cacheReadRate
        + (cacheWriteTokens / 1000) * cacheWriteRate
        + (safeCompletionTokens / 1000) * outputRate;
}

/**
 * Abstract base class for all AI providers
 * All providers must extend this class and implement all methods
 */
export abstract class AIProvider {
    abstract readonly providerName: string;
    /** True only when this adapter faithfully maps tool definitions/results. */
    readonly supportsTools: boolean = false;

    /**
     * Send a chat request (non-streaming)
     */
    abstract chat(request: UnifiedChatRequest): Promise<UnifiedChatResponse>;

    /**
     * Send a chat request (streaming)
     * Returns an async generator that yields chunks of the response
     */
    abstract stream(request: UnifiedChatRequest): AsyncGenerator<StreamChunk>;

    /**
     * Count tokens in text
     * Used for cost estimation and validation
     */
    abstract countTokens(text: string, model?: string): Promise<number>;

    /**
     * Get pricing for a specific model
     * Retrieves from database or provider-specific defaults
     */
    abstract getPricing(model: string): Promise<ModelPricing>;

    /**
     * Test provider connection/authentication
     * Returns true if provider is accessible, false otherwise
     */
    abstract testConnection(): Promise<boolean>;

    /**
     * Calculate cost based on token usage
     * Common implementation for all providers
     */
    protected calculateCost(
        promptTokens: number,
        completionTokens: number,
        pricing: ModelPricing,
        cached?: CachedTokenUsage
    ): number {
        return calculateProviderTokenCost(promptTokens, completionTokens, pricing, cached);
    }

    /**
     * Apply markup to provider cost
     */
    protected applyMarkup(providerCost: number, markupPercentage: number): number {
        return providerCost * (1 + markupPercentage / 100);
    }
}
