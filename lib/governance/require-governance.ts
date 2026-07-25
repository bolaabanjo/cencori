/**
 * Session-auth + governance-permission gate for the governance API (PRD M1/M0.4).
 *
 * Governance endpoints are operated by humans (risk/compliance/dev), so they use
 * session auth (not API keys). The org is supplied via the X-Organization-ID
 * header (or ?organizationId=). requireGovernancePermission denies anyone
 * without the needed role in that org — which also serves as the membership
 * check (a non-member has no governance role → 403).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireGovernancePermission, type GovernancePermission } from '@/lib/governance/rbac';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type GovernanceAuth =
    | { ok: true; userId: string; orgId: string; supabase: SupabaseAdmin; clientIp: string | null }
    | { ok: false; response: NextResponse };

export async function requireGovernanceAuth(
    req: NextRequest,
    permission: GovernancePermission,
): Promise<GovernanceAuth> {
    const supabaseUser = await createServerClient();
    const { data: { user }, error } = await supabaseUser.auth.getUser();
    if (error || !user) {
        return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const orgId = req.headers.get('x-organization-id') || req.nextUrl.searchParams.get('organizationId');
    if (!orgId) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Missing organization id (X-Organization-ID header)' }, { status: 400 }),
        };
    }

    const supabase = createAdminClient();
    const check = await requireGovernancePermission(supabase, orgId, user.id, permission);
    if (!check.ok) return { ok: false, response: check.response };

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    return { ok: true, userId: user.id, orgId, supabase, clientIp };
}
