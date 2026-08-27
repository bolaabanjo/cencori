/**
 * Settling token usage for a streamed response.
 *
 * Streaming has no single response object to read usage off, so the gateway
 * historically counted tokens from the request and response text once the
 * stream drained. That estimate ignores tools, system framing, and — since it
 * works from text — cached prompt tokens, which are the cheapest tokens a
 * provider sells. Adapters that can report real usage now do so on the final
 * StreamChunk; this prefers that and keeps the estimator as the fallback for
 * adapters and providers that report nothing.
 */

import {
    calculateProviderTokenCost,
    type CachedTokenUsage,
    type ModelPricing,
    type TokenUsage,
} from '@/lib/providers/base';

export interface SettledStreamUsage {
    /** Whole prompt the model saw, cached tokens included — for logs and quota. */
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    providerCostUsd: number;
    /** True when the figures came from the provider rather than an estimate. */
    fromProvider: boolean;
    /**
     * Prompt tokens served from cache, when the provider said so.
     *
     * Carried out of here so callers can report it. It was folded into `promptTokens` and
     * otherwise discarded, which made prompt caching unobservable from outside the gateway: a
     * client could not tell a cold prefix from a cached one, and neither could we. Undefined
     * means the provider reported nothing — which is not the same as reporting zero, and the two
     * must stay distinguishable or an unsupported provider looks like a cache that never hits.
     */
    cacheReadTokens?: number;
    /** Prompt tokens written to cache on this request, when the provider said so. */
    cacheWriteTokens?: number;
}

export async function settleStreamUsage(params: {
    reported: TokenUsage | undefined;
    /** Called only when the provider reported nothing. */
    estimate: () => Promise<{ promptTokens: number; completionTokens: number }>;
    pricing: ModelPricing;
}): Promise<SettledStreamUsage> {
    const { reported, estimate, pricing } = params;

    // Billable prompt tokens exclude anything served from or written to cache;
    // those are priced separately and would otherwise be charged twice.
    let billablePromptTokens: number;
    let completionTokens: number;
    const cached: CachedTokenUsage = {};

    if (reported) {
        billablePromptTokens = Math.max(0, reported.promptTokens);
        completionTokens = Math.max(0, reported.completionTokens);
        cached.cacheReadTokens = reported.cacheReadTokens;
        cached.cacheWriteTokens = reported.cacheWriteTokens;
    } else {
        const estimated = await estimate();
        billablePromptTokens = Math.max(0, estimated.promptTokens);
        completionTokens = Math.max(0, estimated.completionTokens);
    }

    const cachedTokens = (cached.cacheReadTokens ?? 0) + (cached.cacheWriteTokens ?? 0);
    const promptTokens = billablePromptTokens + cachedTokens;

    return {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        providerCostUsd: calculateProviderTokenCost(
            billablePromptTokens,
            completionTokens,
            pricing,
            cached,
        ),
        fromProvider: reported !== undefined,
        ...(cached.cacheReadTokens === undefined ? {} : { cacheReadTokens: cached.cacheReadTokens }),
        ...(cached.cacheWriteTokens === undefined
            ? {}
            : { cacheWriteTokens: cached.cacheWriteTokens }),
    };
}

/**
 * The OpenAI-shaped `usage` object, including cache detail when the provider reported it.
 *
 * Built in one place because it is returned from four: the non-streaming completion, the two
 * streaming terminal chunks, and `/v1/responses`. They had drifted into rebuilding the same three
 * fields by hand, which is how `cached_tokens` came to be dropped everywhere at once — caching
 * was invisible to every client and to us, so nobody could tell a cold prefix from a warm one.
 *
 * `prompt_tokens_details` is omitted entirely when the provider said nothing, because absent and
 * zero mean different things: one is a provider that does not report caching, the other is a
 * cache that did not hit.
 */
export function toOpenAiUsage(usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}) {
    const details: Record<string, number> = {};
    if (usage.cacheReadTokens !== undefined) details.cached_tokens = usage.cacheReadTokens;
    if (usage.cacheWriteTokens !== undefined) details.cache_write_tokens = usage.cacheWriteTokens;

    return {
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
        ...(Object.keys(details).length ? { prompt_tokens_details: details } : {}),
    };
}
