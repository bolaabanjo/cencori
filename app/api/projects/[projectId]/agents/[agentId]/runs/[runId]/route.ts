/**
 * GET /api/projects/:projectId/agents/:agentId/runs/:runId
 *
 * Current state of a run (status, output/error, suspend info) — proxied to the
 * agent's runtime.
 */

import { NextRequest } from 'next/server';
import { resolveAgentBase, forwardJson } from '@/lib/compute/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ projectId: string; agentId: string; runId: string }> },
) {
    const { projectId, agentId, runId } = await params;
    const resolved = await resolveAgentBase(projectId, agentId);
    if (!resolved.ok) return resolved.response;
    return forwardJson(resolved.baseUrl, `/runs/${encodeURIComponent(runId)}`, 'GET');
}
