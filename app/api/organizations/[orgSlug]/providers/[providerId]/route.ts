import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createServerClient } from '@/lib/supabaseServer';
import { encryptApiKey } from '@/lib/encryption';
import { writeAuditLog } from '@/lib/audit-log';
import { assertSafeOutboundUrl } from '@/lib/security/outbound-url';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; providerId: string }> }
) {
  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const { orgSlug, providerId } = await params;
    const body = await req.json();
    const { name, baseUrl, apiKey, format, isActive } = body;
    const supabaseAdmin = createAdminClient();
    
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, owner_id')
      .eq('slug', orgSlug)
      .single();
    
    if (!org) {
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
    if (format !== undefined) updateData.format = format;
    if (isActive !== undefined) updateData.is_active = isActive;
    if (apiKey !== undefined) {
      updateData.api_key_encrypted = apiKey ? encryptApiKey(apiKey, org.id) : null;
    }
    
    const { data: provider, error } = await supabaseAdmin
      .from('custom_providers')
      .update(updateData)
      .eq('id', providerId)
      .eq('organization_id', org.id)
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    writeAuditLog({
      organizationId: org.id,
      category: 'provider',
      action: 'updated',
      resourceType: 'custom_provider',
      resourceId: providerId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      actorType: 'user',
      description: `Org custom provider updated: ${providerId}`,
      metadata: { updatedFields: Object.keys(updateData) },
    });

    return NextResponse.json({ provider });
  } catch (error) {
    console.error('[API] Error updating provider:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; providerId: string }> }
) {
  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const { orgSlug, providerId } = await params;
    const supabaseAdmin = createAdminClient();
    
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, owner_id')
      .eq('slug', orgSlug)
      .single();
    
    if (!org) {
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
    
    const { error } = await supabaseAdmin
      .from('custom_providers')
      .delete()
      .eq('id', providerId)
      .eq('organization_id', org.id);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    writeAuditLog({
      organizationId: org.id,
      category: 'provider',
      action: 'deleted',
      resourceType: 'custom_provider',
      resourceId: providerId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      actorType: 'user',
      description: `Org custom provider deleted: ${providerId}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Error deleting provider:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
