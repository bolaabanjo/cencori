import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { extractVariableNames } from '@/lib/prompts/registry';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; promptId: string }> }
) {
    const { projectId, promptId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const supabase = createAdminClient();
    const url = new URL(req.url);

    const gate = await requireTierFeatureForProject(projectId, 'promptRegistry');
    if (gate) return gate;

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabase
        .from('prompt_versions')
        .select('*', { count: 'exact' })
        .eq('prompt_id', promptId)
        .order('version', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ versions: data || [], total: count || 0, page, limit });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; promptId: string }> }
) {
    const { projectId, promptId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const body = await req.json();
    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'promptRegistry');
    if (gate) return gate;

    const { content, model_hint, temperature, max_tokens, change_message } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Get next version number
    const { data: latest } = await supabase
        .from('prompt_versions')
        .select('version')
        .eq('prompt_id', promptId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

    const nextVersion = (latest?.version || 0) + 1;
    const variables = extractVariableNames(content);

    const { data: version, error } = await supabase
        .from('prompt_versions')
        .insert({
            prompt_id: promptId,
            version: nextVersion,
            content: content.trim(),
            model_hint: model_hint ?? null,
            temperature: temperature ?? null,
            max_tokens: max_tokens ?? null,
            variables,
            change_message: change_message || null,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: proj } = await supabase.from('projects').select('organization_id').eq('id', projectId).single();
    if (proj?.organization_id) {
        writeAuditLog({
            organizationId: proj.organization_id,
            projectId,
            category: 'prompt',
            action: 'created',
            resourceType: 'prompt_version',
            resourceId: version.id,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            description: `Prompt version ${nextVersion} created for prompt ${promptId}`,
            metadata: { promptId, versionNumber: nextVersion },
        });
    }

    return NextResponse.json({ version }, { status: 201 });
}
