import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createServerClient } from '@/lib/supabaseServer';
import { encryptApiKey } from '@/lib/encryption';
import { trackEvent } from '@/lib/track-event';
import { writeAuditLog } from '@/lib/audit-log';
import { assertSafeOutboundUrl } from '@/lib/security/outbound-url';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { orgSlug } = await params;
        const supabaseAdmin = createAdminClient();

        const { data: org, error: orgError } = await supabaseAdmin
            .from('organizations')
            .select('id, owner_id')
            .eq('slug', orgSlug)
            .single();

        if (orgError || !org) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }

        let hasOrgAccess = org.owner_id === user.id;
        if (!hasOrgAccess) {
            const { data: membership, error: membershipError } = await supabaseAdmin
                .from('organization_members')
                .select('role')
                .eq('organization_id', org.id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (membershipError) {
                console.error('[API] Error checking organization access:', membershipError);
                return NextResponse.json({ error: 'Failed to verify organization access' }, { status: 500 });
            }

            hasOrgAccess = !!membership;
        }

        if (!hasOrgAccess) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { data: providers, error } = await supabaseAdmin
            .from('custom_providers')
            .select(`
        id,
        name,
        base_url,
        format,
        is_active,
        created_at,
        custom_models(id, name, model_id)
      `)
            .eq('organization_id', org.id)
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
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { orgSlug } = await params;
        const supabaseAdmin = createAdminClient();

        const { data: org, error: orgError } = await supabaseAdmin
            .from('organizations')
            .select('id, owner_id')
            .eq('slug', orgSlug)
            .single();

        if (orgError || !org) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }

        const isOwner = org.owner_id === user.id;
        let membershipRole: string | null = null;
        if (!isOwner) {
            const { data: membership, error: membershipError } = await supabaseAdmin
                .from('organization_members')
                .select('role')
                .eq('organization_id', org.id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (membershipError) {
                console.error('[API] Error checking organization access:', membershipError);
                return NextResponse.json({ error: 'Failed to verify organization access' }, { status: 500 });
            }

            membershipRole = membership?.role ?? null;
        }

        if (!isOwner && membershipRole !== 'admin') {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }

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

        const encryptedKey = apiKey ? encryptApiKey(apiKey, org.id) : null;

        const { data: provider, error } = await supabaseAdmin
            .from('custom_providers')
            .insert({
                organization_id: org.id,
                name,
                base_url: baseUrl,
                api_key_encrypted: encryptedKey,
                format,
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
                name: model.name,
                model_id: model.modelId,
            }));

            await supabaseAdmin.from('custom_models').insert(modelsToInsert);
        }

        trackEvent({ event_type: 'org.provider_added', product: 'gateway', user_id: user.id, organization_id: org.id, metadata: { provider_name: name } });

        writeAuditLog({
            organizationId: org.id,
            category: 'provider',
            action: 'created',
            resourceType: 'custom_provider',
            resourceId: provider.id,
            actorId: user.id,
            actorEmail: user.email ?? null,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: `Org custom provider created: ${name}`,
            metadata: { providerName: name, format, modelCount: models?.length ?? 0 },
        });

        return NextResponse.json({ provider }, { status: 201 });
    } catch (error) {
        console.error('[API] Error creating provider:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
