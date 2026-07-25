/**
 * Install a starter policy template as a draft (PRD M1 — "compliance in one call").
 *   POST /api/v1/governance/templates/:templateId/install   (policy.propose)
 *   body: { name?: string }
 * Creates a DRAFT policy from the template; it still goes through maker-checker
 * (request-activation → approve) before it enforces.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';
import { installPolicyTemplate } from '@/lib/governance/policy-templates';

export async function POST(req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
    const auth = await requireGovernanceAuth(req, 'policy.propose');
    if (!auth.ok) return auth.response;

    const { templateId } = await params;
    let body: { name?: unknown } = {};
    try { body = await req.json(); } catch { /* body optional */ }
    const name = typeof body.name === 'string' ? body.name : undefined;

    try {
        const result = await installPolicyTemplate(auth.supabase, {
            orgId: auth.orgId, templateId, name, createdBy: auth.userId, actorIp: auth.clientIp,
        });
        if ('error' in result) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }
        return NextResponse.json({ ...result, status: 'draft', template_id: templateId }, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to install template' }, { status: 500 });
    }
}
