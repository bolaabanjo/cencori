import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';
import { assertSafeOutboundUrl } from '@/lib/security/outbound-url';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; providerId: string }> }
) {
    const supabase = createAdminClient();

    try {
        const { projectId, providerId } = await params;
        const projectAccess = await requireProjectAccess(projectId);
        if (!projectAccess.ok) return projectAccess.response;

        const { data: provider, error } = await supabase
            .from('custom_providers')
            .select(`
                id,
                name,
                base_url,
                api_format,
                is_active,
                created_at,
                custom_models(id, model_name, display_name, is_active)
            `)
            .eq('id', providerId)
            .eq('project_id', projectId)
            .single();

        if (error || !provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        return NextResponse.json({ provider });
    } catch (error) {
        console.error('[API] Error fetching provider:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; providerId: string }> }
) {
    const supabase = createAdminClient();

    try {
        const { projectId, providerId } = await params;
        const projectAccess = await requireProjectAccess(projectId);
        if (!projectAccess.ok) return projectAccess.response;
        const body = await req.json();
        const { name, baseUrl, isActive, format } = body;

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

        if (baseUrl !== undefined) {
            try {
                await assertSafeOutboundUrl(baseUrl);
            } catch {
                return NextResponse.json(
                    { error: 'baseUrl must resolve to a public HTTP or HTTPS destination' },
                    { status: 400 },
                );
            }
        }

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (baseUrl !== undefined) updateData.base_url = baseUrl;
        if (isActive !== undefined) updateData.is_active = isActive;
        if (format !== undefined) updateData.api_format = format;
        updateData.updated_at = new Date().toISOString();

        const { data: provider, error } = await supabase
            .from('custom_providers')
            .update(updateData)
            .eq('id', providerId)
            .eq('project_id', projectId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const { data: proj } = await supabase
            .from('projects')
            .select('organization_id')
            .eq('id', projectId)
            .single();

        writeAuditLog({
            organizationId: proj?.organization_id ?? projectId,
            projectId,
            category: 'provider',
            action: 'updated',
            resourceType: 'custom_provider',
            resourceId: providerId,
            actorId: null,
            actorEmail: null,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: `Custom provider updated: ${providerId}`,
            metadata: { updatedFields: Object.keys(updateData).filter(k => k !== 'updated_at') },
        });

        return NextResponse.json({ provider });
    } catch (error) {
        console.error('[API] Error updating provider:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; providerId: string }> }
) {
    const supabase = createAdminClient();

    try {
        const { projectId, providerId } = await params;
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

        const { error } = await supabase
            .from('custom_providers')
            .delete()
            .eq('id', providerId)
            .eq('project_id', projectId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const { data: proj } = await supabase
            .from('projects')
            .select('organization_id')
            .eq('id', projectId)
            .single();

        writeAuditLog({
            organizationId: proj?.organization_id ?? projectId,
            projectId,
            category: 'provider',
            action: 'deleted',
            resourceType: 'custom_provider',
            resourceId: providerId,
            actorId: null,
            actorEmail: null,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: `Custom provider deleted: ${providerId}`,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Error deleting provider:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
