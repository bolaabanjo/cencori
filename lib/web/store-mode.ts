export type WebStoreMode = 'postgres' | 'supabase';

interface WebStoreEnvironment {
    [key: string]: string | undefined;
    CENCORI_WEB_STORE?: string;
    CENCORI_WEB_DATABASE_URL?: string;
}

export function resolveWebStoreMode(environment: WebStoreEnvironment): WebStoreMode {
    const configured = environment.CENCORI_WEB_STORE?.trim().toLowerCase() || 'auto';
    if (!['auto', 'postgres', 'supabase'].includes(configured)) {
        throw new Error('CENCORI_WEB_STORE must be auto, postgres, or supabase');
    }
    if (configured === 'postgres') {
        if (!environment.CENCORI_WEB_DATABASE_URL) {
            throw new Error('CENCORI_WEB_DATABASE_URL is required when CENCORI_WEB_STORE=postgres');
        }
        return 'postgres';
    }
    if (configured === 'supabase') return 'supabase';
    return environment.CENCORI_WEB_DATABASE_URL ? 'postgres' : 'supabase';
}
