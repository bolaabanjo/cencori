const GOOGLE_API_KEY_ENV_ORDER = [
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GEMINI_API_KEY',
] as const;

export function getGoogleApiKey(): string | null {
    for (const envKey of GOOGLE_API_KEY_ENV_ORDER) {
        const value = process.env[envKey];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}

/**
 * Memory-dedicated Google key. Lets memory embeddings run on their own project
 * so general Gemini chat traffic can't tap the memory quota (and vice versa).
 * Falls back to the shared managed key when unset, so nothing breaks if it's
 * not configured.
 */
export function getMemoryGoogleApiKey(): string | null {
    const dedicated = process.env.MEMORY_GEMINI_API_KEY;
    if (typeof dedicated === 'string' && dedicated.trim().length > 0) {
        return dedicated.trim();
    }
    return getGoogleApiKey();
}

/**
 * Dedicated memory API key for a given provider, so memory's generative fan-out
 * (Cerebras → Groq → Gemini) runs on its OWN quota buckets, never competing with
 * chat traffic. Returns undefined when no dedicated key is set — the caller then
 * uses the shared managed key for that provider (nothing breaks if unconfigured).
 *
 *   MEMORY_GEMINI_API_KEY / MEMORY_GROQ_API_KEY / MEMORY_CEREBRAS_API_KEY
 */
export function getMemoryProviderKey(provider: string): string | undefined {
    const envByProvider: Record<string, string | undefined> = {
        google: process.env.MEMORY_GEMINI_API_KEY,
        groq: process.env.MEMORY_GROQ_API_KEY,
        cerebras: process.env.MEMORY_CEREBRAS_API_KEY,
    };
    const value = envByProvider[provider];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function getGoogleApiKeySource(): string | null {
    for (const envKey of GOOGLE_API_KEY_ENV_ORDER) {
        const value = process.env[envKey];
        if (typeof value === 'string' && value.trim().length > 0) {
            return envKey;
        }
    }
    return null;
}

