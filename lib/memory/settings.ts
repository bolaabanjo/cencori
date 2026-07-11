/**
 * Project memory settings — Redis-cached lookup of project_memory_settings.
 *
 * Memory works out of the box (API opt-in): a missing settings row means
 * defaults with enabled: true. A row exists only to customize extraction
 * or to flip the kill switch.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import {
    getCachedMemoryConfig,
    setCachedMemoryConfig,
} from '@/lib/config-cache';
import { DEFAULT_MEMORY_SETTINGS, type MemorySettings } from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export async function getProjectMemorySettings(
    supabase: SupabaseAdmin,
    projectId: string
): Promise<MemorySettings> {
    const cached = await getCachedMemoryConfig(projectId);
    if (cached?.data) {
        return cached.data as MemorySettings;
    }

    let settings: MemorySettings = DEFAULT_MEMORY_SETTINGS;

    try {
        const { data: row } = await supabase
            .from('project_memory_settings')
            .select(
                'enabled, extraction_model, extraction_prompt, min_importance, max_memories_per_exchange, session_ttl_seconds'
            )
            .eq('project_id', projectId)
            .maybeSingle();

        if (row) {
            settings = {
                enabled: row.enabled !== false,
                extractionModel: row.extraction_model || DEFAULT_MEMORY_SETTINGS.extractionModel,
                extractionPrompt: row.extraction_prompt || null,
                minImportance:
                    typeof row.min_importance === 'number'
                        ? row.min_importance
                        : Number(row.min_importance ?? DEFAULT_MEMORY_SETTINGS.minImportance),
                maxMemoriesPerExchange:
                    row.max_memories_per_exchange ?? DEFAULT_MEMORY_SETTINGS.maxMemoriesPerExchange,
                sessionTtlSeconds:
                    row.session_ttl_seconds ?? DEFAULT_MEMORY_SETTINGS.sessionTtlSeconds,
            };
        }
    } catch (error) {
        console.warn('[Memory] Settings lookup failed, using defaults:', error);
    }

    await setCachedMemoryConfig(projectId, settings);
    return settings;
}
