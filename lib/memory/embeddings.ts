/**
 * Memory embeddings — 1536-dim, matching the gateway_memories.embedding column.
 *
 * Managed default: Google `gemini-embedding-001` at outputDimensionality=1536
 * (free tier, no OpenAI dependency). BYOK: a project's own active OpenAI key
 * still wins and uses text-embedding-3-small (also 1536, so vectors stay
 * comparable within a project). Both paths yield the same dimensionality.
 *
 * A project must not switch providers mid-life — OpenAI-space and Gemini-space
 * vectors are not comparable. New projects have no memories, so the managed
 * Gemini default is a clean baseline.
 *
 * (The semantic cache uses a separate Gemini 768-dim stack — not shared.)
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI, type EmbedContentRequest } from '@google/generative-ai';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import { decryptApiKey } from '@/lib/encryption';
import { getPricingFromDB } from '@/lib/providers/pricing';
import { getGoogleApiKey } from '@/lib/providers/google-env';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

// BYOK OpenAI path (kept for projects that bring their own OpenAI key).
export const MEMORY_EMBEDDING_MODEL = 'text-embedding-3-small';
// Managed default — free, 1536-dim via Matryoshka output dimensionality.
export const MEMORY_EMBEDDING_MODEL_MANAGED = 'gemini-embedding-001';
export const MEMORY_EMBEDDING_DIMENSIONS = 1536;

export interface MemoryEmbeddingResult {
    embeddings: number[][];
    totalTokens: number;
    providerCostUsd: number;
    cencoriChargeUsd: number;
    markupPercentage: number;
    /** Which model actually produced the vectors ('openai' BYOK or managed Gemini). */
    model: string;
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

    // BYOK OpenAI wins if the project brought one; otherwise managed Gemini.
    const { data: providerKey } = await supabase
        .from('provider_keys')
        .select('encrypted_key, is_active')
        .eq('project_id', projectId)
        .eq('provider', 'openai')
        .eq('is_active', true)
        .single();

    if (providerKey?.encrypted_key) {
        const openaiKey = decryptApiKey(providerKey.encrypted_key, organizationId);
        return embedWithOpenAI(openaiKey, inputs);
    }

    return embedWithGemini(inputs);
}

/** Managed path — Google gemini-embedding-001 at 1536 dims. Free tier. */
async function embedWithGemini(inputs: string[]): Promise<MemoryEmbeddingResult> {
    const key = getGoogleApiKey();
    if (!key) {
        throw new Error('No Google API key configured for memory embeddings');
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: MEMORY_EMBEDDING_MODEL_MANAGED });

    const embeddings: number[][] = [];
    let totalTokens = 0;
    for (const text of inputs) {
        // outputDimensionality is supported by the API (Matryoshka) but missing
        // from the v0.24.1 SDK types — widen the request type to pass it.
        const request: EmbedContentRequest & { outputDimensionality?: number } = {
            content: { role: 'user', parts: [{ text }] },
            outputDimensionality: MEMORY_EMBEDDING_DIMENSIONS,
        };
        const result = await model.embedContent(request);
        embeddings.push(result.embedding.values);
        totalTokens += Math.ceil(text.length / 4);
    }

    // Free tier — no provider cost billed for managed embeddings today.
    return {
        embeddings,
        totalTokens,
        providerCostUsd: 0,
        cencoriChargeUsd: 0,
        markupPercentage: 0,
        model: MEMORY_EMBEDDING_MODEL_MANAGED,
    };
}

/** BYOK path — OpenAI text-embedding-3-small (1536 dims). */
async function embedWithOpenAI(openaiKey: string, inputs: string[]): Promise<MemoryEmbeddingResult> {
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
        model: MEMORY_EMBEDDING_MODEL,
    };
}
