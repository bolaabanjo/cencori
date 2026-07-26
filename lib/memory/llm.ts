/**
 * Memory generative call — provider fan-out.
 *
 * Extraction, reconciliation, and entity extraction all need *a* capable model
 * returning JSON — they don't care which. Memory is a MANAGED product, so
 * Cencori picks the backend, and picks SEVERAL: the call fans out across free
 * managed providers in order and returns the first success.
 *
 *   Groq Llama  →  Cerebras gpt-oss
 *
 * Generation is deliberately Google-free: Gemini does only embeddings for
 * memory (its dedicated project has generative models retired for new projects
 * anyway). Why a chain instead of one provider:
 * - No single dependency (not beholden to Google — or to any one of them).
 * - Aggregate free throughput = the sum of each provider's free rate limit, so
 *   one provider throttling doesn't stall memory.
 * - Deliberately excludes OpenAI/Anthropic — a memory call must never cascade
 *   into an unfunded paid provider.
 *
 * Each attempt disables the gateway's own fallback (`googleOnly`) so it is
 * exactly one provider; the fan-out across providers is done HERE. Never throws
 * — returns null when the whole chain is exhausted, and the caller fails open.
 */

import { executeGatewayChat } from '@/lib/gateway/chat-executor';
import { getMemoryProviderKey } from '@/lib/providers/google-env';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { SubscriptionTier } from '@/lib/entitlements';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Ordered list of free managed models to try. Each resolves to a distinct
 * provider (Cerebras / Groq / Google). Override via MEMORY_LLM_CHAIN
 * (comma-separated) without a deploy.
 */
export const MEMORY_LLM_CHAIN: string[] = (process.env.MEMORY_LLM_CHAIN
    ?.split(',')
    .map(s => s.trim())
    .filter(Boolean)) ?? [
    'llama-3.3-70b-versatile',  // Groq — free, capable, higher rate limits (primary)
    'gpt-oss-120b',             // Cerebras — free, strong reconcile quality (fallback)
    // Gemini is intentionally NOT here: memory's generation stays Google-free
    // (Gemini serves embeddings only). Add a current Gemini model to
    // MEMORY_LLM_CHAIN for a 3rd fallback if you want one.
];

/** Dedicated memory keys per provider (falls back to shared managed key when unset). */
function memoryProviderKeys(): Record<string, string | undefined> {
    return {
        google: getMemoryProviderKey('google'),
        groq: getMemoryProviderKey('groq'),
        cerebras: getMemoryProviderKey('cerebras'),
    };
}

export interface MemoryLlmParams {
    supabase: SupabaseAdmin;
    projectId: string;
    organizationId: string;
    tier: SubscriptionTier;
    requestId?: string;
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    temperature?: number;
    maxTokens?: number;
    /** Pin this model first if it's already in the chain (e.g. project's configured model). */
    preferModel?: string;
}

export interface MemoryLlmResult {
    content: string;
    model: string;
    provider: string;
    costUsd: number;
}

/** Build the attempt order, pinning preferModel first when it's a chain member. */
function orderedChain(preferModel?: string): string[] {
    if (preferModel && MEMORY_LLM_CHAIN.includes(preferModel)) {
        return [preferModel, ...MEMORY_LLM_CHAIN.filter(m => m !== preferModel)];
    }
    return MEMORY_LLM_CHAIN;
}

/**
 * Run a memory generative call across the provider chain. Returns the first
 * provider that answers, or null if every provider failed (rate-limited/errored).
 */
export async function callMemoryLlm(params: MemoryLlmParams): Promise<MemoryLlmResult | null> {
    const chain = orderedChain(params.preferModel);
    let attempts = 0;

    for (const model of chain) {
        attempts++;
        try {
            const response = await executeGatewayChat({
                supabase: params.supabase,
                projectId: params.projectId,
                organizationId: params.organizationId,
                tier: params.tier,
                requestId: params.requestId,
                // Each provider uses its dedicated memory key when configured.
                memoryProviderKeys: memoryProviderKeys(),
                // Single-provider attempt — this fan-out owns cross-provider fallback.
                googleOnly: true,
                request: {
                    model,
                    temperature: params.temperature ?? 0,
                    maxTokens: params.maxTokens ?? 800,
                    messages: params.messages,
                },
            });
            return {
                content: response.content ?? '',
                model: response.actualModel ?? model,
                provider: response.actualProvider,
                costUsd: response.cost?.cencoriChargeUsd ?? 0,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[Memory] LLM provider '${model}' failed (${attempts}/${chain.length}), trying next:`, msg);
        }
    }

    console.warn('[Memory] LLM fan-out exhausted — all providers failed.');
    return null;
}
