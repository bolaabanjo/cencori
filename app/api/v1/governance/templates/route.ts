/**
 * List starter policy templates (PRD M1).
 *   GET /api/v1/governance/templates   (audit.read)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';
import { listPolicyTemplates } from '@/lib/governance/policy-templates';

export async function GET(req: NextRequest) {
    const auth = await requireGovernanceAuth(req, 'audit.read');
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: listPolicyTemplates() });
}
