/**
 * Provider Failover Configuration & Execution
 * 
 * Defines fallback chains and model mappings for automatic failover
 * when primary providers are unavailable.
 */

/**
 * Fallback provider chains
 * When primary fails, try fallbacks in order
 */
export const FALLBACK_CHAINS: Record<string, string[]> = {
    'openai': ['anthropic', 'google', 'groq', 'mistral'],
    'anthropic': ['openai', 'google', 'groq', 'mistral'],
    'google': ['openai', 'anthropic', 'groq', 'mistral'],
    'xai': ['openai', 'anthropic', 'groq', 'google'],
    'deepseek': ['openai', 'anthropic', 'groq', 'google'],
    'mistral': ['openai', 'anthropic', 'groq', 'google'],
    'cohere': ['openai', 'anthropic', 'google'],
    'groq': ['openai', 'anthropic', 'google', 'mistral'],
    'perplexity': ['openai', 'anthropic', 'google'],
    'together': ['openai', 'anthropic', 'google'],
    'qwen': ['openai', 'anthropic', 'google'],
};

/**
 * Cross-provider model mapping
 * Maps a model to equivalent models on other providers
 */
export const MODEL_MAPPINGS: Record<string, Record<string, string>> = {
    // OpenAI models → fallbacks
    'gpt-5.6-sol': { 'anthropic': 'claude-opus-4-8', 'google': 'gemini-3.1-pro-preview' },
    'gpt-5.6-terra': { 'anthropic': 'claude-sonnet-4-6', 'google': 'gemini-3.5-flash' },
    'gpt-5.6-luna': { 'anthropic': 'claude-sonnet-4-6', 'google': 'gemini-3-flash-preview' },
    'gpt-5.5': { 'anthropic': 'claude-opus-4-8', 'google': 'gemini-3.1-pro-preview' },
    'gpt-5.4': { 'anthropic': 'claude-opus-4-8', 'google': 'gemini-3.1-pro-preview' },
    'gpt-5.4-pro': { 'anthropic': 'claude-opus-4', 'google': 'gemini-3-pro' },
    'gpt-5.3-chat-latest': { 'anthropic': 'claude-opus-4', 'google': 'gemini-3-pro' },
    'gpt-5': { 'anthropic': 'claude-opus-4', 'google': 'gemini-3-pro' },
    'gpt-4o': { 'anthropic': 'claude-sonnet-4-6', 'google': 'gemini-2.5-flash' },
    'gpt-4o-mini': { 'anthropic': 'claude-sonnet-4-6', 'google': 'gemini-2.5-flash-lite' },
    'o3': { 'anthropic': 'claude-opus-4-8', 'google': 'gemini-3.1-pro-preview' },
    'o3-mini': { 'anthropic': 'claude-sonnet-4', 'google': 'gemini-2.5-flash' },
    'o1': { 'anthropic': 'claude-sonnet-4', 'google': 'gemini-2.5-pro' },

    // Anthropic models → fallbacks
    'claude-opus-4-8': { 'openai': 'gpt-5.5', 'google': 'gemini-3.1-pro-preview' },
    'claude-opus-4-7': { 'openai': 'gpt-5.5', 'google': 'gemini-3.1-pro-preview' },
    'claude-opus-4-6': { 'openai': 'gpt-5.4', 'google': 'gemini-3.1-pro-preview' },
    'claude-sonnet-4-6': { 'openai': 'gpt-5.4-mini', 'google': 'gemini-3.5-flash' },
    'claude-sonnet-5': { 'openai': 'gpt-5.5', 'google': 'gemini-3.1-pro-preview' },
    'claude-opus-4': { 'openai': 'gpt-5', 'google': 'gemini-3-pro' },
    'claude-opus-4.5': { 'openai': 'gpt-5', 'google': 'gemini-3-pro' },
    'claude-sonnet-4': { 'openai': 'gpt-4o', 'google': 'gemini-2.5-flash' },
    'claude-sonnet-4.5': { 'openai': 'gpt-4o', 'google': 'gemini-2.5-flash' },
    'claude-haiku-4.5': { 'openai': 'gpt-4o-mini', 'google': 'gemini-2.5-flash-lite' },
    'claude-3-5-sonnet-20241022': { 'openai': 'gpt-4o', 'google': 'gemini-2.5-flash' },

    // Google models → fallbacks
    'gemini-3-pro': { 'openai': 'gpt-5', 'anthropic': 'claude-opus-4' },
    'gemini-3.5-flash': { 'openai': 'gpt-5.4-mini', 'anthropic': 'claude-sonnet-4-6' },
    'gemini-3.1-pro-preview': { 'openai': 'gpt-5.5', 'anthropic': 'claude-opus-4-8' },
    'gemini-3-flash-preview': { 'openai': 'gpt-5.4-mini', 'anthropic': 'claude-sonnet-4-6' },
    'gemini-2.5-pro': { 'openai': 'gpt-5.4', 'anthropic': 'claude-sonnet-4-6' },
    'gemini-2.5-flash': { 'openai': 'gpt-5.4-mini', 'anthropic': 'claude-sonnet-4-6' },
    'gemini-2.0-flash': { 'openai': 'gpt-4o-mini', 'anthropic': 'claude-haiku-4.5' },

    // xAI models → fallbacks
    'grok-voice-think-fast': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4.5' },
    'grok-4': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4' },
    'grok-4.1': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4' },
    'grok-3': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4' },

    // Mistral models → fallbacks
    'mistral-large-latest': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4', 'google': 'gemini-2.5-flash' },
    'codestral-latest': { 'openai': 'gpt-4.1', 'anthropic': 'claude-sonnet-4' },

    // Groq models → fallbacks
    'llama-3.3-70b-versatile': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4', 'google': 'gemini-2.5-flash' },
    'llama-3.3-70b-specdec': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4', 'google': 'gemini-2.5-flash' },
    'llama-3.1-70b-versatile': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4', 'google': 'gemini-2.5-flash' },
    'mixtral-8x7b-32768': { 'openai': 'gpt-4o-mini', 'anthropic': 'claude-haiku-4.5', 'google': 'gemini-2.5-flash-lite' },
    'llama3-70b-8192': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4', 'google': 'gemini-2.5-flash' },

    // DeepSeek models → fallbacks
    'deepseek-chat': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4', 'google': 'gemini-2.5-flash' },
    'deepseek-reasoner': { 'openai': 'o1', 'anthropic': 'claude-opus-4', 'google': 'gemini-3-deep-think' },
    'deepseek-v4-pro': { 'openai': 'gpt-5', 'anthropic': 'claude-opus-4.5', 'google': 'gemini-3.1-pro-preview' },
    'deepseek-v4-flash': { 'openai': 'gpt-4o', 'anthropic': 'claude-sonnet-4.5', 'google': 'gemini-2.5-flash' },
};

// In-memory cache for DB mappings
let dbMappingsCache: Record<string, Record<string, string>> | null = null;
let dbMappingsCacheTime = 0;
let dbMappingsPromise: Promise<Record<string, Record<string, string>>> | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Load model mappings from DB (cached)
 * Falls back to hardcoded MODEL_MAPPINGS if DB is unavailable.
 * Uses a promise mutex to prevent concurrent DB reads when cache expires.
 */
async function loadDbMappings(): Promise<Record<string, Record<string, string>>> {
    if (dbMappingsCache && Date.now() - dbMappingsCacheTime < CACHE_TTL_MS) {
        return dbMappingsCache;
    }

    if (dbMappingsPromise) {
        return dbMappingsPromise;
    }

    dbMappingsPromise = (async () => {
        try {
            const { createAdminClient } = await import('@/lib/supabaseAdmin');
            const supabase = createAdminClient();
            const { data, error } = await supabase
                .from('model_mappings')
                .select('source_model, target_provider, target_model');

            if (error || !data || data.length === 0) {
                return MODEL_MAPPINGS;
            }

            const mappings: Record<string, Record<string, string>> = {};
            for (const row of data) {
                if (!mappings[row.source_model]) mappings[row.source_model] = {};
                mappings[row.source_model][row.target_provider] = row.target_model;
            }

            dbMappingsCache = mappings;
            dbMappingsCacheTime = Date.now();
            return mappings;
        } catch {
            return MODEL_MAPPINGS;
        } finally {
            dbMappingsPromise = null;
        }
    })();

    return dbMappingsPromise;
}

/** Invalidate the DB mappings cache (call after writes) */
export function invalidateMappingsCache() {
    dbMappingsCache = null;
    dbMappingsCacheTime = 0;
}

/**
 * Get fallback model for a given model on a fallback provider.
 * If a configuredFallbackModel is provided, it takes priority over mappings.
 */
export async function getFallbackModel(
    originalModel: string,
    fallbackProvider: string,
    configuredFallbackModel?: string | null
): Promise<string> {
    if (configuredFallbackModel) {
        return configuredFallbackModel;
    }

    const allMappings = await loadDbMappings();
    const mappings = allMappings[originalModel];

    if (mappings && mappings[fallbackProvider]) {
        return mappings[fallbackProvider];
    }

    // Default fallback models per provider if no mapping exists
    const defaultFallbacks: Record<string, string> = {
        'openai': 'gpt-5.4-mini',
        'anthropic': 'claude-sonnet-4-6',
        'google': 'gemini-2.5-flash',
    };

    return defaultFallbacks[fallbackProvider] || 'gpt-5.4-mini';
}

/**
 * Get the fallback chain for a provider
 * Returns a specific fallback provider if configured, otherwise the default chain
 */
export function getFallbackChain(primaryProvider: string, configuredFallback?: string | null): string[] {
    // If a specific fallback provider is configured, use it first
    if (configuredFallback && configuredFallback !== primaryProvider) {
        const chain = [configuredFallback];

        // Add other fallbacks from the default chain
        const defaultChain = FALLBACK_CHAINS[primaryProvider] || ['openai', 'anthropic'];
        for (const provider of defaultChain) {
            if (provider !== configuredFallback && provider !== primaryProvider) {
                chain.push(provider);
            }
        }

        return chain;
    }

    return FALLBACK_CHAINS[primaryProvider] || ['openai', 'anthropic'];
}

/**
 * Check if an error is retryable (should trigger failover)
 */
export function isRetryableError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Retryable conditions
    const retryablePatterns = [
        'rate limit',
        'too many requests',
        '429',
        'service unavailable',
        '503',
        'timeout',
        'connection refused',
        'network error',
        'econnreset',
        'socket hang up',
        'internal server error',
        '500',
        'bad gateway',
        '502',
        'gateway timeout',
        '504',
    ];

    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Check if an error is NOT retryable (should not trigger failover)
 */
export function isNonRetryableError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Non-retryable conditions
    const nonRetryablePatterns = [
        'invalid api key',
        'unauthorized',
        'authentication',
        'invalid request',
        'bad request',
        'model not found',
        'content filtered',
        'content_filter',
        'blocked',
        'safety',
    ];

    return nonRetryablePatterns.some(pattern => errorMessage.includes(pattern));
}
