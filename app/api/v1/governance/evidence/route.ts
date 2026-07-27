/**
 * Regulator-ready evidence pack (PRD M2).
 *   GET /api/v1/governance/evidence?framework=CBN-AML&from=&to=   (audit.read)
 * Returns machine-generated proof that each control fired, from the immutable
 * ledger, with chain-completeness attached.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';
import { generateEvidencePack } from '@/lib/governance/evidence';
import { requireTierFeatureForOrg } from '@/lib/require-tier-feature';

export async function GET(req: NextRequest) {
    const auth = await requireGovernanceAuth(req, 'audit.read');
    if (!auth.ok) return auth.response;

    const planGate = await requireTierFeatureForOrg(
        auth.orgId,
        'governanceAdvancedEvidence',
        'enterprise',
    );
    if (planGate) return planGate;

    const framework = req.nextUrl.searchParams.get('framework');
    if (!framework) {
        return NextResponse.json({ error: 'framework query param is required' }, { status: 400 });
    }
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');

    try {
        const pack = await generateEvidencePack(auth.supabase, { orgId: auth.orgId, framework, from, to });
        return NextResponse.json(pack);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to generate evidence' }, { status: 500 });
    }
}
