import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createServerClient } from '@/lib/supabaseServer';
import { encryptApiKey } from '@/lib/encryption';
import { SUPPORTED_PROVIDERS, getProvider } from '@/lib/providers/config';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

interface ProviderKeyResponse {
    provider: string;
    providerName: string;
    hasKey: boolean;
    keyHint?: string;
    isActive: boolean;
    defaultModel?: string;
    defaultImageModel?: string;
    createdAt?: string;
    apiKey?: string;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { projectId } = await params;
        const supabaseAdmin = createAdminClient();

        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('id, organization_id, default_provider, default_model, default_image_model, organizations!inner(owner_id)')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
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

        const { data: providerKeys, error } = await supabaseAdmin
            .from('provider_keys')
            .select('provider, key_hint, is_active, created_at, default_model, default_image_model')
            .eq('project_id', projectId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const keyMap = new Map(providerKeys?.map(k => [k.provider, k]) || []);

        const providers: ProviderKeyResponse[] = SUPPORTED_PROVIDERS.map(p => {
            const key = keyMap.get(p.id);
            return {
                provider: p.id,
                providerName: p.name,
                hasKey: !!key,
                keyHint: key?.key_hint || undefined,
                isActive: key?.is_active ?? false,
                defaultModel: key?.default_model || undefined,
                defaultImageModel: key?.default_image_model || undefined,
                createdAt: key?.created_at || undefined,
            };
        });

        return NextResponse.json({
            providers,
            defaults: {
                provider: project.default_provider,
                model: project.default_model,
                imageModel: project.default_image_model,
            },
        });
    } catch (error) {
        console.error('[API] Error fetching provider keys:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { projectId } = await params;
        const supabaseAdmin = createAdminClient();

        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('id, organization_id, organizations!inner(owner_id)')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
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

        const body = await req.json();
        const { provider, apiKey, setAsDefault, defaultModel, defaultImageModel } = body;

        const providerConfig = getProvider(provider);
        if (!providerConfig) {
            return NextResponse.json(
                { error: `Invalid provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.map(p => p.id).join(', ')}` },
                { status: 400 }
            );
        }

        if (!apiKey) {
            return NextResponse.json({ error: 'API key is required' }, { status: 400 });
        }

        const encryptedKey = encryptApiKey(apiKey, project.organization_id);

        const keyHint = apiKey.length > 4 ? `...${apiKey.slice(-4)}` : '****';

        const { data: providerKey, error } = await supabaseAdmin
            .from('provider_keys')
            .upsert({
                project_id: projectId,
                provider,
                encrypted_key: encryptedKey,
                key_hint: keyHint,
                is_active: true,
                default_model: defaultModel || undefined,
                default_image_model: defaultImageModel || undefined,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'project_id,provider',
            })
            .select()
            .single();

        if (error) {
            console.error('[API] Error saving provider key:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
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
            action: 'created',
            resourceType: 'provider_key',
            resourceId: providerKey.id,
            actorId: user.id,
            actorEmail: user.email ?? null,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: `Provider key saved for ${provider}`,
            metadata: { provider, setAsDefault: !!setAsDefault },
        });

        return NextResponse.json({
            success: true,
            provider: {
                provider: providerKey.provider,
                keyHint: providerKey.key_hint,
                isActive: providerKey.is_active,
                defaultModel: providerKey.default_model,
                defaultImageModel: providerKey.default_image_model,
            },
        }, { status: 201 });
    } catch (error) {
        console.error('[API] Error saving provider key:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
