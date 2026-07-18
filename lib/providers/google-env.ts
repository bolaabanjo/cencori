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

export function getGoogleApiKeySource(): string | null {
    for (const envKey of GOOGLE_API_KEY_ENV_ORDER) {
        const value = process.env[envKey];
        if (typeof value === 'string' && value.trim().length > 0) {
            return envKey;
        }
    }
    return null;
}

