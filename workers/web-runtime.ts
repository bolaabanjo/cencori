import { createAdminClient } from '../lib/supabaseAdmin';
import { PostgresWebDataStore, SupabaseWebDataStore, type WebDataStore } from '../lib/web/store';
import { resolveWebStoreMode } from '../lib/web/store-mode';

export function createWorkerWebDataStore(): WebDataStore {
    const mode = resolveWebStoreMode(process.env);
    if (mode === 'postgres') {
        return new PostgresWebDataStore(process.env.CENCORI_WEB_DATABASE_URL!);
    }
    return new SupabaseWebDataStore(createAdminClient());
}
