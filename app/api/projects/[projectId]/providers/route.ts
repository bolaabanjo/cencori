import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { encryptApiKey } from '@/lib/encryption';
import { trackEvent } from '@/lib/track-event';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';
import { assertSafeOutboundUrl } from '@/lib/security/outbound-url';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabase = createAdminClient();

    try {
        const { projectId } = await params;
        const projectAccess = await requireProjectAccess(projectId);
        if (!projectAccess.ok) return projectAccess.response;

        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'customProviders');
        if (gate) return gate;

        const { data: providers, error } = await supabase
            .from('custom_providers')
            .select(`
                id,
                name,
                base_url,
                api_format,
                is_active,
                created_at,
                custom_models(id, model_name, display_name)
            `)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ providers: providers || [] });
    } catch (error) {
        console.error('[API] Error fetching providers:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabase = createAdminClient();

    try {
        const { projectId } = await params;
        const projectAccess = await requireProjectAccess(projectId);
        if (!projectAccess.ok) return projectAccess.response;

        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, organization_id')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'customProviders');
        if (gate) return gate;

        const body = await req.json();
        const { name, baseUrl, apiKey, format, models } = body;

        if (!name || !baseUrl || !format) {
            return NextResponse.json(
                { error: 'Missing required fields: name, baseUrl, format' },
                { status: 400 }
            );
        }

        try {
            await assertSafeOutboundUrl(baseUrl);
        } catch {
            return NextResponse.json(
                { error: 'baseUrl must resolve to a public HTTP or HTTPS destination' },
                { status: 400 },
            );
        }

        const encryptedKey = apiKey ? encryptApiKey(apiKey, project.organization_id) : null;

        const { data: provider, error } = await supabase
            .from('custom_providers')
            .insert({
                project_id: projectId,
                name,
                base_url: baseUrl,
                encrypted_api_key: encryptedKey,
                api_format: format,
                is_active: true,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (models && Array.isArray(models) && models.length > 0) {
            const modelsToInsert = models.map((model: { name: string; modelId: string }) => ({
                provider_id: provider.id,
                model_name: model.modelId,
                display_name: model.name,
            }));

            await supabase.from('custom_models').insert(modelsToInsert);
        }

        trackEvent({ event_type: 'provider.added', product: 'gateway', project_id: projectId, metadata: { provider_name: name } });

        writeAuditLog({
            organizationId: project.organization_id,
            projectId,
            category: 'provider',
            action: 'created',
            resourceType: 'custom_provider',
            resourceId: provider.id,
            actorId: null,
            actorEmail: null,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: `Custom provider created: ${name}`,
            metadata: { providerName: name, format, modelCount: models?.length ?? 0 },
        });

        return NextResponse.json({ provider }, { status: 201 });
    } catch (error) {
        console.error('[API] Error creating provider:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
