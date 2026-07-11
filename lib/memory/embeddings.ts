/**
 * Memory embeddings — OpenAI text-embedding-3-small (1536-dim), matching the
 * gateway_memories.embedding column. BYOK: the project's own OpenAI key from
 * provider_keys wins; the managed platform key is the fallback.
 *
 * (The semantic cache uses a separate Gemini 768-dim stack — intentionally
 * not shared; the dimensions are incompatible.)
 */

import OpenAI from 'openai';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import { decryptApiKey } from '@/lib/encryption';
import { getPricingFromDB } from '@/lib/providers/pricing';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const MEMORY_EMBEDDING_MODEL = 'text-embedding-3-small';
export const MEMORY_EMBEDDING_DIMENSIONS = 1536;

export interface MemoryEmbeddingResult {
    embeddings: number[][];
    totalTokens: number;
    providerCostUsd: number;
    cencoriChargeUsd: number;
    markupPercentage: number;
}

/**
 * Embed one or more strings for memory storage/search.
 * Throws on failure — callers decide whether to fail open (chat retrieval)
 * or surface the error (direct endpoints).
 */
export async function embedForMemory(
    supabase: SupabaseAdmin,
    projectId: string,
    organizationId: string,
    input: string | string[]
): Promise<MemoryEmbeddingResult> {
    const inputs = Array.isArray(input) ? input : [input];

    // BYOK first, managed key as fallback (same pattern as /api/memory/store).
    let openaiKey: string | null = null;
    const { data: providerKey } = await supabase
        .from('provider_keys')
        .select('encrypted_key, is_active')
        .eq('project_id', projectId)
        .eq('provider', 'openai')
        .eq('is_active', true)
        .single();

    if (providerKey?.encrypted_key) {
        openaiKey = decryptApiKey(providerKey.encrypted_key, organizationId);
    } else {
        openaiKey = process.env.OPENAI_API_KEY ?? null;
    }

    if (!openaiKey) {
        throw new Error('No OpenAI API key configured for memory embeddings');
    }

    const client = new OpenAI({ apiKey: openaiKey });
    const response = await client.embeddings.create({
        model: MEMORY_EMBEDDING_MODEL,
        input: inputs,
    });

    const totalTokens = response.usage?.total_tokens ?? 0;
    const pricing = await getPricingFromDB('openai', MEMORY_EMBEDDING_MODEL);
    const providerCostUsd = (totalTokens / 1000) * pricing.inputPer1KTokens;
    const cencoriChargeUsd = providerCostUsd * (1 + pricing.cencoriMarkupPercentage / 100);

    // OpenAI returns embeddings with an index field; keep input order.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);

    return {
        embeddings: ordered.map(d => d.embedding),
        totalTokens,
        providerCostUsd,
        cencoriChargeUsd,
        markupPercentage: pricing.cencoriMarkupPercentage,
    };
}
