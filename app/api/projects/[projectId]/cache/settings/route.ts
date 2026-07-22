import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { trackEvent } from '@/lib/track-event';
import { writeAuditLog } from '@/lib/audit-log';
import { invalidateCacheConfig } from '@/lib/config-cache';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'semanticCache');
    if (gate) return gate;

    const { data, error } = await supabase
        .from('prompt_cache_settings')
        .select('*')
        .eq('project_id', projectId)
        .single();

    if (error && error.code !== 'PGRST116') {
        // Table may not exist yet — return defaults gracefully
        console.warn('[Cache Settings] Query error:', error.code, error.message);
    }

    // Return defaults if no settings exist or table missing
    const settings = data || {
        cache_enabled: false,
        exact_match_enabled: true,
        semantic_match_enabled: false,
        ttl_seconds: 3600,
        similarity_threshold: 0.95,
        max_entries: 10000,
        excluded_models: [],
        max_cacheable_temperature: 0.2,
    };

    return NextResponse.json(settings);
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const body = await req.json();
    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'semanticCache');
    if (gate) return gate;

    const updates: Record<string, any> = {};
    if (typeof body.cache_enabled === 'boolean') updates.cache_enabled = body.cache_enabled;
    if (typeof body.exact_match_enabled === 'boolean') updates.exact_match_enabled = body.exact_match_enabled;
    if (typeof body.semantic_match_enabled === 'boolean') updates.semantic_match_enabled = body.semantic_match_enabled;
    if (typeof body.ttl_seconds === 'number') updates.ttl_seconds = Math.max(60, Math.min(86400, body.ttl_seconds));
    if (typeof body.similarity_threshold === 'number') updates.similarity_threshold = Math.max(0.8, Math.min(1.0, body.similarity_threshold));
    if (typeof body.max_entries === 'number') updates.max_entries = Math.max(100, Math.min(100000, body.max_entries));
    if (Array.isArray(body.excluded_models)) updates.excluded_models = body.excluded_models;
    if (typeof body.max_cacheable_temperature === 'number') updates.max_cacheable_temperature = Math.max(0, Math.min(2.0, body.max_cacheable_temperature));

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('prompt_cache_settings')
        .upsert({
            project_id: projectId,
            ...updates,
        }, {
            onConflict: 'project_id',
        })
        .select()
        .single();

    if (error) {
        // Table may not exist yet
        console.warn('[Cache Settings] Upsert error:', error.code, error.message);
        return NextResponse.json({ error: 'Cache tables not yet migrated. Run the prompt_cache migration first.' }, { status: 503 });
    }

    // Invalidate cached config so next request gets fresh settings
    await invalidateCacheConfig(projectId);

    trackEvent({ event_type: 'cache.settings_changed', product: 'gateway', project_id: projectId, metadata: updates });

    const { data: project } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', projectId)
        .single();

    writeAuditLog({
        organizationId: project?.organization_id || '',
        projectId,
        category: 'cache',
        action: 'updated',
        resourceType: 'cache_settings',
        resourceId: projectId,
        actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        actorType: 'user',
        description: 'Updated cache settings',
        metadata: { changes: updates },
    });

    return NextResponse.json(data);
}
