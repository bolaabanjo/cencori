/**
 * Governance policies — create draft + list (PRD M1 authoring API).
 *   POST  /api/v1/governance/policies      (policy.propose) — create a draft
 *   GET   /api/v1/governance/policies      (audit.read)     — list policies
 * Org via X-Organization-ID header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';
import { createPolicyDraft, type PolicySpec } from '@/lib/governance/policy-store';

export async function POST(req: NextRequest) {
    const auth = await requireGovernanceAuth(req, 'policy.propose', { requirePaidControls: true });
    if (!auth.ok) return auth.response;

    let body: { name?: unknown; spec?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!body.spec || typeof body.spec !== 'object' || !Array.isArray((body.spec as PolicySpec).rules)) {
        return NextResponse.json({ error: 'spec with a rules[] array is required' }, { status: 400 });
    }

    try {
        const result = await createPolicyDraft(auth.supabase, {
            orgId: auth.orgId, name: body.name, spec: body.spec as PolicySpec, createdBy: auth.userId, actorIp: auth.clientIp,
        });
        return NextResponse.json({ id: result.id, name: body.name, version: result.version, status: 'draft' }, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create policy' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const auth = await requireGovernanceAuth(req, 'audit.read');
    if (!auth.ok) return auth.response;

    const status = req.nextUrl.searchParams.get('status');
    let query = auth.supabase
        .from('governance_policies')
        .select('id, name, version, status, spec, created_by, approved_by, created_at, activated_at')
        .eq('org_id', auth.orgId)
        .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
}
