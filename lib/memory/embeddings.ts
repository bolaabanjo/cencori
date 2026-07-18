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
import { calculateProviderTokenCost } from '@/lib/providers/base';
import { getMemoryGoogleApiKey } from '@/lib/providers/google-env';

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
    provider: 'openai' | 'google';
}

interface MemoryEmbeddingConfig {
    provider: 'openai' | 'google';
    model: string;
    encryptedOpenAIKey?: string;
}

async function resolveMemoryEmbeddingConfig(
    supabase: SupabaseAdmin,
    projectId: string
): Promise<MemoryEmbeddingConfig> {
    const { data: providerKey, error: keyError } = await supabase
        .from('provider_keys')
        .select('encrypted_key')
        .eq('project_id', projectId)
        .eq('provider', 'openai')
        .eq('is_active', true)
        .maybeSingle();

    if (keyError) {
        throw new Error(`Could not resolve memory embedding credentials: ${keyError.message}`);
    }

    const preferredProvider: 'openai' | 'google' = providerKey?.encrypted_key
        ? 'openai'
        : 'google';
    const preferredModel = preferredProvider === 'openai'
        ? MEMORY_EMBEDDING_MODEL
        : MEMORY_EMBEDDING_MODEL_MANAGED;

    const { data, error } = await supabase.rpc('claim_gateway_memory_embedding_config', {
        p_project_id: projectId,
        p_provider: preferredProvider,
        p_model: preferredModel,
    });

    if (error) {
        throw new Error(`Could not pin memory embedding space: ${error.message}`);
    }

    const claimed = Array.isArray(data) ? data[0] : data;
    if (claimed?.embedding_provider === 'openai') {
        if (!providerKey?.encrypted_key) {
            throw new Error(
                'This project\'s memory space is pinned to OpenAI, but its active OpenAI provider key is unavailable.'
            );
        }
        return {
            provider: 'openai',
            model: MEMORY_EMBEDDING_MODEL,
            encryptedOpenAIKey: providerKey.encrypted_key,
        };
    }

    if (claimed?.embedding_provider === 'google') {
        return { provider: 'google', model: MEMORY_EMBEDDING_MODEL_MANAGED };
    }

    throw new Error('The project memory embedding space could not be resolved.');
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

    const config = await resolveMemoryEmbeddingConfig(supabase, projectId);
    if (config.provider === 'openai' && config.encryptedOpenAIKey) {
        const openaiKey = decryptApiKey(config.encryptedOpenAIKey, organizationId);
        return embedWithOpenAI(openaiKey, inputs);
    }

    return embedWithGemini(inputs);
}

/** Managed path — Google gemini-embedding-001 at 1536 dims. */
async function embedWithGemini(inputs: string[]): Promise<MemoryEmbeddingResult> {
    // Memory-dedicated key (MEMORY_GEMINI_API_KEY) when set, else the shared
    // managed key. Isolates memory embedding quota from general Gemini chat.
    const key = getMemoryGoogleApiKey();
    if (!key) {
        throw new Error('No Google API key configured for memory embeddings');
    }

    // Resolve paid-tier list pricing before making a potentially billable call.
    // Free-tier allowance is not a durable production billing guarantee.
    const pricing = await getPricingFromDB('google', MEMORY_EMBEDDING_MODEL_MANAGED);
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

    const providerCostUsd = calculateProviderTokenCost(totalTokens, 0, pricing);
    const cencoriChargeUsd = providerCostUsd * (1 + pricing.cencoriMarkupPercentage / 100)
        + (pricing.fixedFeePerRequest ?? 0);

    return {
        embeddings,
        totalTokens,
        providerCostUsd,
        cencoriChargeUsd,
        markupPercentage: pricing.cencoriMarkupPercentage,
        model: MEMORY_EMBEDDING_MODEL_MANAGED,
        provider: 'google',
    };
}

/** BYOK path — OpenAI text-embedding-3-small (1536 dims). */
async function embedWithOpenAI(openaiKey: string, inputs: string[]): Promise<MemoryEmbeddingResult> {
    const pricing = await getPricingFromDB('openai', MEMORY_EMBEDDING_MODEL);
    const client = new OpenAI({ apiKey: openaiKey, timeout: 55_000, maxRetries: 0 });
    const response = await client.embeddings.create({
        model: MEMORY_EMBEDDING_MODEL,
        input: inputs,
    });

    const totalTokens = response.usage?.total_tokens ?? 0;
    const providerCostUsd = calculateProviderTokenCost(totalTokens, 0, pricing);
    const cencoriChargeUsd = providerCostUsd * (1 + pricing.cencoriMarkupPercentage / 100)
        + (pricing.fixedFeePerRequest ?? 0);

    // OpenAI returns embeddings with an index field; keep input order.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);

    return {
        embeddings: ordered.map(d => d.embedding),
        totalTokens,
        providerCostUsd,
        cencoriChargeUsd,
        markupPercentage: pricing.cencoriMarkupPercentage,
        model: MEMORY_EMBEDDING_MODEL,
        provider: 'openai',
    };
}
