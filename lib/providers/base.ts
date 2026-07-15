/**
 * Base Provider Interface and Types
 * 
 * This file defines the core abstraction layer for all AI providers.
 * All provider implementations (OpenAI, Anthropic, Gemini, Custom) must implement this interface.
 */

/**
 * Unified message format across all providers
 */
export interface UnifiedMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
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
}

/**
 * Token usage information
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
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
    finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
    /** Error message if the stream encountered an error */
    error?: string;
    /** Tool calls in this chunk (streamed incrementally) */
    toolCalls?: ToolCall[];
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
 * Calculate provider token cost, including request-wide long-context tiers.
 * Cached input is intentionally not accepted until every streaming adapter can
 * report it consistently; callers therefore bill prompt tokens at the normal
 * input rate rather than applying an unverified discount.
 */
export function calculateProviderTokenCost(
    promptTokens: number,
    completionTokens: number,
    pricing: ModelPricing
): number {
    const safePromptTokens = Math.max(0, Number(promptTokens) || 0);
    const safeCompletionTokens = Math.max(0, Number(completionTokens) || 0);
    const useLongContext = pricing.longContextThresholdTokens !== undefined
        && safePromptTokens > pricing.longContextThresholdTokens;
    const inputRate = useLongContext
        ? pricing.longContextInputPer1KTokens
        : pricing.inputPer1KTokens;
    const outputRate = useLongContext
        ? pricing.longContextOutputPer1KTokens
        : pricing.outputPer1KTokens;

    if (inputRate === undefined || outputRate === undefined) {
        throw new Error('Long-context pricing is incomplete');
    }

    return (safePromptTokens / 1000) * inputRate
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
        pricing: ModelPricing
    ): number {
        return calculateProviderTokenCost(promptTokens, completionTokens, pricing);
    }

    /**
     * Apply markup to provider cost
     */
    protected applyMarkup(providerCost: number, markupPercentage: number): number {
        return providerCost * (1 + markupPercentage / 100);
    }
}
