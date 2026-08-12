import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createServerClient } from '@/lib/supabaseServer';
import { encryptApiKey } from '@/lib/encryption';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';
import { invalidateProviderConfig } from '@/lib/config-cache';

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; provider: string }> }
) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { projectId, provider } = await params;
        const body = await req.json();
        const { apiKey, isActive, defaultModel, defaultImageModel, setAsDefault } = body;
        const supabaseAdmin = createAdminClient();

        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('organization_id, organizations!inner(owner_id)')
            .eq('id', projectId)
            .single();

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'customProviders');
        if (gate) return gate;

        const ownerId = (project.organizations as { owner_id?: string } | null)?.owner_id || null;
        const isOwner = ownerId === user.id;
        let membershipRole: string | null = null;

        if (!isOwner) {
            const { data: membership, error: membershipError } = await supabaseAdmin
                .from('organization_members')
                .select('role')
                .eq('organization_id', project.organization_id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (membershipError) {
                console.error('[API] Error checking project access:', membershipError);
                return NextResponse.json({ error: 'Failed to verify project access' }, { status: 500 });
            }

            membershipRole = membership?.role ?? null;
        }

        if (!isOwner && membershipRole !== 'admin') {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }

        const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        if (apiKey) {
            updateData.encrypted_key = encryptApiKey(apiKey, project.organization_id);
            updateData.key_hint = apiKey.length > 4 ? `...${apiKey.slice(-4)}` : '****';
        }
        if (typeof isActive === 'boolean') {
            updateData.is_active = isActive;
        }
        if (defaultModel) {
            updateData.default_model = defaultModel;
        }
        if (defaultImageModel) {
            updateData.default_image_model = defaultImageModel;
        }

        const { data: providerKey, error } = await supabaseAdmin
            .from('provider_keys')
            .update(updateData)
            .eq('project_id', projectId)
            .eq('provider', provider)
            .select()
            .single();

        if (error) {
            console.error('[PATCH provider-keys] Update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!providerKey) {
            return NextResponse.json({ error: 'Provider key not found' }, { status: 404 });
        }

        if (setAsDefault || defaultModel || defaultImageModel) {
            const projectUpdate: Record<string, string> = {};
            if (setAsDefault) projectUpdate.default_provider = provider;
            if (defaultModel) projectUpdate.default_model = defaultModel;
            if (defaultImageModel) projectUpdate.default_image_model = defaultImageModel;

            await supabaseAdmin
                .from('projects')
                .update(projectUpdate)
                .eq('id', projectId);
        }

        writeAuditLog({
            organizationId: project.organization_id,
            projectId,
            category: 'provider',
            action: 'updated',
            resourceType: 'provider_key',
            resourceId: providerKey.id,
            actorId: user.id,
            actorEmail: user.email ?? null,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: `Provider key updated for ${provider}`,
            metadata: { provider, updatedFields: Object.keys(updateData) },
        });

        await invalidateProviderConfig(projectId, provider);

        return NextResponse.json({
            success: true,
            provider: {
                provider: providerKey.provider,
                keyHint: providerKey.key_hint,
                isActive: providerKey.is_active,
                defaultModel: providerKey.default_model,
                defaultImageModel: providerKey.default_image_model,
            },
        });
    } catch (error) {
        console.error('[API] Error updating provider key:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; provider: string }> }
) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { projectId, provider } = await params;
        const supabaseAdmin = createAdminClient();

        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('organization_id, organizations!inner(owner_id)')
            .eq('id', projectId)
            .single();

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'customProviders');
        if (gate) return gate;

        const ownerId = (project.organizations as { owner_id?: string } | null)?.owner_id || null;
        const isOwner = ownerId === user.id;
        let membershipRole: string | null = null;

        if (!isOwner) {
            const { data: membership, error: membershipError } = await supabaseAdmin
                .from('organization_members')
                .select('role')
                .eq('organization_id', project.organization_id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (membershipError) {
                console.error('[API] Error checking project access:', membershipError);
                return NextResponse.json({ error: 'Failed to verify project access' }, { status: 500 });
            }

            membershipRole = membership?.role ?? null;
        }

        if (!isOwner && membershipRole !== 'admin') {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }

        const { error } = await supabaseAdmin
            .from('provider_keys')
            .delete()
            .eq('project_id', projectId)
            .eq('provider', provider);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await invalidateProviderConfig(projectId, provider);

        writeAuditLog({
            organizationId: project.organization_id,
            projectId,
            category: 'provider',
            action: 'removed',
            resourceType: 'provider_key',
            resourceId: null,
            actorId: user.id,
            actorEmail: user.email ?? null,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: `Provider key removed for ${provider}`,
            metadata: { provider },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Error deleting provider key:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
