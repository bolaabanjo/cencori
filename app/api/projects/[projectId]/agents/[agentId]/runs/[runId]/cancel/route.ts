/**
 * POST /api/projects/:projectId/agents/:agentId/runs/:runId/cancel
 *
 * Request cancellation of an in-flight (or suspended) run — proxied to the runtime.
 */

import { NextRequest } from 'next/server';
import { resolveAgentBase, forwardJson } from '@/lib/compute/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ projectId: string; agentId: string; runId: string }> },
) {
    const { projectId, agentId, runId } = await params;
    const resolved = await resolveAgentBase(projectId, agentId);
    if (!resolved.ok) return resolved.response;
    return forwardJson(resolved.baseUrl, `/runs/${encodeURIComponent(runId)}/cancel`, 'POST', '{}');
}
