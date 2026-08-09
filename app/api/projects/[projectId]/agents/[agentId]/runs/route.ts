/**
 * POST /api/projects/:projectId/agents/:agentId/runs
 *
 * Start an async run on the agent's runtime (proxied). Body: { input }.
 * Returns the run stub { id, status }; subscribe to /runs/:id/events for the
 * live timeline.
 */

import { NextRequest } from 'next/server';
import { resolveAgentBase, forwardJson } from '@/lib/compute/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; agentId: string }> },
) {
    const { projectId, agentId } = await params;
    const resolved = await resolveAgentBase(projectId, agentId);
    if (!resolved.ok) return resolved.response;
    const body = await req.text();
    return forwardJson(resolved.baseUrl, '/runs', 'POST', body || '{}');
}
