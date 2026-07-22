import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { invalidateCache } from '@/lib/cache/prompt-cache';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const model = url.searchParams.get('model');
    const environment = url.searchParams.get('environment');
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'semanticCache');
    if (gate) return gate;

    let query = supabase
        .from('prompt_cache_entries')
        .select('id, cache_key, prompt_text, model, temperature, hit_count, tokens_saved, cost_saved_usd, last_hit_at, created_at, expires_at', { count: 'exact' })
        .eq('project_id', projectId)
        .gt('expires_at', new Date().toISOString())
        .order('hit_count', { ascending: false })
        .range(offset, offset + limit - 1);

    if (environment === 'production' || environment === 'test') {
        query = query.eq('environment', environment);
    }

    if (model) {
        query = query.eq('model', model);
    }

    const { data, count, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        entries: (data || []).map(e => ({
            ...e,
            prompt_preview: e.prompt_text.slice(0, 200),
            prompt_text: undefined,
        })),
        total: count || 0,
        page,
        limit,
    });
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const body = await req.json();

    const result = await invalidateCache({
        projectId,
        environment: body.environment,
        cacheKey: body.cache_key,
        model: body.model,
        all: body.all,
    });

    return NextResponse.json({ deleted: result.deletedCount });
}
