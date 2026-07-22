import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { slugify, extractVariableNames } from '@/lib/prompts/registry';
import { trackEvent } from '@/lib/track-event';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'promptRegistry');
    if (gate) return gate;

    const { data, error } = await supabase
        .from('prompt_registry')
        .select(`
            *,
            active_version:prompt_versions!prompt_registry_active_version_id_fkey(
                id, version, content, model_hint, created_at
            )
        `)
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get usage counts
    const promptIds = (data || []).map(p => p.id);
    let usageCounts: Record<string, number> = {};

    if (promptIds.length > 0) {
        const { data: usage } = await supabase
            .from('prompt_usage_log')
            .select('prompt_id')
            .in('prompt_id', promptIds);

        if (usage) {
            for (const u of usage) {
                usageCounts[u.prompt_id] = (usageCounts[u.prompt_id] || 0) + 1;
            }
        }
    }

    const prompts = (data || []).map(p => ({
        ...p,
        usage_count: usageCounts[p.id] || 0,
    }));

    return NextResponse.json({ prompts });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const body = await req.json();
    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'promptRegistry');
    if (gate) return gate;

    const { name, description, tags, content, model_hint, temperature, max_tokens, change_message } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return NextResponse.json({ error: 'Name is required (min 2 characters)' }, { status: 400 });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const slug = slugify(name.trim());
    const variables = extractVariableNames(content);

    // Create prompt entry
    const { data: prompt, error: promptError } = await supabase
        .from('prompt_registry')
        .insert({
            project_id: projectId,
            name: name.trim(),
            slug,
            description: description || null,
            tags: tags || [],
        })
        .select()
        .single();

    if (promptError) {
        if (promptError.code === '23505') {
            return NextResponse.json({ error: 'A prompt with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: promptError.message }, { status: 500 });
    }

    // Create version 1
    const { data: version, error: versionError } = await supabase
        .from('prompt_versions')
        .insert({
            prompt_id: prompt.id,
            version: 1,
            content: content.trim(),
            model_hint: model_hint || null,
            temperature: temperature ?? null,
            max_tokens: max_tokens ?? null,
            variables,
            change_message: change_message || 'Initial version',
        })
        .select()
        .single();

    if (versionError) {
        // Cleanup prompt if version creation fails
        await supabase.from('prompt_registry').delete().eq('id', prompt.id);
        return NextResponse.json({ error: versionError.message }, { status: 500 });
    }

    // Set active version
    await supabase
        .from('prompt_registry')
        .update({ active_version_id: version.id, updated_at: new Date().toISOString() })
        .eq('id', prompt.id);

    trackEvent({ event_type: 'prompt.created', product: 'gateway', project_id: projectId, metadata: { prompt_name: name.trim(), slug } });

    const { data: proj } = await supabase.from('projects').select('organization_id').eq('id', projectId).single();
    if (proj?.organization_id) {
        writeAuditLog({
            organizationId: proj.organization_id,
            projectId,
            category: 'prompt',
            action: 'created',
            resourceType: 'prompt',
            resourceId: prompt.id,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            description: `Prompt created: ${name.trim()}`,
            metadata: { promptName: name.trim(), slug },
        });
    }

    return NextResponse.json({ prompt: { ...prompt, active_version_id: version.id }, version }, { status: 201 });
}
