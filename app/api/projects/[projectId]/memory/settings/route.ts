/**
 * GET|PATCH /api/projects/:projectId/memory/settings — the project's gateway
 * memory configuration (kill switch, graph layer, extraction tuning).
 *
 * A settings row is optional: memory works on defaults, and a row exists only
 * once someone customizes it. PATCH upserts and invalidates the Redis config
 * cache, otherwise the gateway keeps serving the old config for its TTL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createServerClient } from '@/lib/supabaseServer';
import { invalidateMemoryConfig } from '@/lib/config-cache';
import { writeAuditLog } from '@/lib/audit-log';
import { getProjectMemorySettings, resolveMemoryModel } from '@/lib/memory';

// Managed models memory is allowed to run on (see resolveMemoryModel). Not
// exported — a Next.js route module may only export handlers.
const MEMORY_MODEL_CHOICES = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'Default. Managed, fast, cheap.' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'Better extraction on messy exchanges.' },
    { value: 'gpt-oss-120b', label: 'GPT-OSS 120B', hint: 'Cerebras. Not Google, no Gemini dependency.' },
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', hint: 'Groq. Fast, open, no Gemini dependency.' },
];

/**
 * The choice list must always contain whatever the project is actually running,
 * or the settings form renders an empty box and the operator can't tell what is
 * configured. Any allowed model that isn't a listed preset is surfaced as-is —
 * never quietly replaced with a default, which would change their pipeline
 * behind their back.
 */
function withCurrentModel(choices: typeof MEMORY_MODEL_CHOICES, current: string) {
    if (!current || choices.some(choice => choice.value === current)) return choices;
    return [...choices, { value: current, label: current, hint: 'Currently configured for this project.' }];
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId);
    if (!access.ok) return access.response;

    try {
        const supabase = createAdminClient();
        const settings = await getProjectMemorySettings(supabase, projectId);
        return NextResponse.json({
            settings,
            modelChoices: withCurrentModel(MEMORY_MODEL_CHOICES, settings.extractionModel),
        });
    } catch (error) {
        console.error('[Memory] Settings read error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
    if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
    return Math.min(max, Math.max(min, value));
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId);
    if (!access.ok) return access.response;

    const supabase = createAdminClient();

    try {
        const body = await req.json();
        const update: Record<string, unknown> = { project_id: projectId, updated_at: new Date().toISOString() };

        if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
        if (typeof body.graphEnabled === 'boolean') update.graph_enabled = body.graphEnabled;
        // Memory is managed: an arbitrary model would let a memory call cascade
        // into an unfunded paid provider, so anything unrecognized coerces.
        if (typeof body.extractionModel === 'string') update.extraction_model = resolveMemoryModel(body.extractionModel);
        if (typeof body.extractionPrompt === 'string' || body.extractionPrompt === null) {
            const prompt = typeof body.extractionPrompt === 'string' ? body.extractionPrompt.trim() : '';
            update.extraction_prompt = prompt || null;
        }
        const minImportance = clampNumber(body.minImportance, 0, 1);
        if (minImportance != null) update.min_importance = minImportance;
        const maxPerExchange = clampNumber(body.maxMemoriesPerExchange, 1, 20);
        if (maxPerExchange != null) update.max_memories_per_exchange = Math.round(maxPerExchange);
        const sessionTtl = clampNumber(body.sessionTtlSeconds, 300, 60 * 60 * 24 * 30);
        if (sessionTtl != null) update.session_ttl_seconds = Math.round(sessionTtl);

        if (Object.keys(update).length <= 2) {
            return NextResponse.json({ error: 'No supported settings in request' }, { status: 400 });
        }

        const { error } = await supabase
            .from('project_memory_settings')
            .upsert(update, { onConflict: 'project_id' });
        if (error) throw error;

        // The gateway reads settings through Redis; without this the change
        // doesn't take effect until the cache expires.
        await invalidateMemoryConfig(projectId);

        const settings = await getProjectMemorySettings(supabase, projectId);
        const modelChoices = withCurrentModel(MEMORY_MODEL_CHOICES, settings.extractionModel);

        const authClient = await createServerClient();
        const { data: { user } } = await authClient.auth.getUser();
        writeAuditLog({
            organizationId: access.organizationId,
            projectId,
            category: 'memory',
            action: 'configured',
            resourceType: 'project_memory_settings',
            resourceId: projectId,
            actorId: access.userId,
            actorEmail: user?.email ?? null,
            description: 'Updated memory settings',
            metadata: { changed: Object.keys(update).filter(k => k !== 'project_id' && k !== 'updated_at') },
        });

        return NextResponse.json({ settings, modelChoices });
    } catch (error) {
        console.error('[Memory] Settings write error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
