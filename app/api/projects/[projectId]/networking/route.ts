import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit-log';
import { invalidateNetworkConfig } from '@/lib/config-cache';
import { normalizeCidr } from '@/lib/networking/cidr';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireProjectAccess } from '@/lib/require-project-access';

type AccessMode = 'public' | 'restricted';

const DEFAULT_POLICY = {
    access_mode: 'public' as AccessMode,
    allowed_cidrs: [] as string[],
};

function parsePolicyBody(body: unknown):
    | { ok: true; accessMode: AccessMode; allowedCidrs: string[] }
    | { ok: false; error: string } {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body' };

    const candidate = body as { access_mode?: unknown; allowed_cidrs?: unknown };
    if (candidate.access_mode !== 'public' && candidate.access_mode !== 'restricted') {
        return { ok: false, error: 'access_mode must be public or restricted' };
    }

    if (!Array.isArray(candidate.allowed_cidrs)) {
        return { ok: false, error: 'allowed_cidrs must be an array' };
    }

    if (candidate.allowed_cidrs.length > 100) {
        return { ok: false, error: 'A maximum of 100 source ranges is allowed' };
    }

    const normalized = candidate.allowed_cidrs.map((value) =>
        typeof value === 'string' ? normalizeCidr(value) : null
    );
    const invalidIndex = normalized.findIndex((value) => value === null);
    if (invalidIndex !== -1) {
        return {
            ok: false,
            error: `Invalid IPv4 or IPv6 CIDR at position ${invalidIndex + 1}`,
        };
    }

    const allowedCidrs = [...new Set(normalized as string[])];
    if (candidate.access_mode === 'restricted' && allowedCidrs.length === 0) {
        return { ok: false, error: 'Restricted access requires at least one source range' };
    }

    return { ok: true, accessMode: candidate.access_mode, allowedCidrs };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId);
    if (!access.ok) return access.response;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('project_network_policies')
        .select('access_mode, allowed_cidrs, updated_at')
        .eq('project_id', projectId)
        .maybeSingle();

    if (error) {
        console.error('[Project Networking] GET error:', error);
        return NextResponse.json({ error: 'Failed to load network policy' }, { status: 500 });
    }

    return NextResponse.json({
        ...DEFAULT_POLICY,
        ...(data || {}),
        allowed_cidrs: Array.isArray(data?.allowed_cidrs) ? data.allowed_cidrs : [],
    });
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId);
    if (!access.ok) return access.response;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = parsePolicyBody(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createAdminClient();
    const updatedAt = new Date().toISOString();
    const { error } = await supabase
        .from('project_network_policies')
        .upsert({
            project_id: projectId,
            access_mode: parsed.accessMode,
            allowed_cidrs: parsed.allowedCidrs,
            updated_at: updatedAt,
        }, { onConflict: 'project_id' });

    if (error) {
        console.error('[Project Networking] PUT error:', error);
        return NextResponse.json({ error: 'Failed to update network policy' }, { status: 500 });
    }

    await invalidateNetworkConfig(projectId);

    writeAuditLog({
        organizationId: access.organizationId,
        projectId,
        category: 'settings',
        action: 'updated',
        resourceType: 'project_network_policy',
        resourceId: projectId,
        actorId: access.userId,
        actorIp: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        actorType: 'user',
        description: `Changed project ingress policy to ${parsed.accessMode}`,
        metadata: {
            access_mode: parsed.accessMode,
            allowed_cidrs: parsed.allowedCidrs,
        },
    });

    return NextResponse.json({
        success: true,
        access_mode: parsed.accessMode,
        allowed_cidrs: parsed.allowedCidrs,
        updated_at: updatedAt,
    });
}
