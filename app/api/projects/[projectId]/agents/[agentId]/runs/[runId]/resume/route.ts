/**
 * POST /api/projects/:projectId/agents/:agentId/runs/:runId/resume
 *
 * Resume a suspended run (human approval / interrupt) — proxied to the runtime.
 * Body: { resume } or { input }. New events flow on the still-open events stream.
 */

import { NextRequest } from 'next/server';
import { resolveAgentBase, forwardJson } from '@/lib/compute/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; agentId: string; runId: string }> },
) {
    const { projectId, agentId, runId } = await params;
    const resolved = await resolveAgentBase(projectId, agentId);
    if (!resolved.ok) return resolved.response;
    const body = await req.text();
    return forwardJson(resolved.baseUrl, `/runs/${encodeURIComponent(runId)}/resume`, 'POST', body || '{}');
}
