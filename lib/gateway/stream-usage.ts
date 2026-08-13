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
    };
}
