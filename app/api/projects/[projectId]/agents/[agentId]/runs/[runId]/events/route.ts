/**
 * GET /api/projects/:projectId/agents/:agentId/runs/:runId/events
 *
 * SSE proxy: streams the agent runtime's normalized run events straight through
 * to the browser (EventSource). Reconnects resume from ?after= or the
 * Last-Event-ID header. The browser's abort tears down the upstream fetch, which
 * unsubscribes the run on the runtime.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentBase } from '@/lib/compute/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; agentId: string; runId: string }> },
) {
    const { projectId, agentId, runId } = await params;
    const resolved = await resolveAgentBase(projectId, agentId);
    if (!resolved.ok) return resolved.response;

    const after = new URL(req.url).searchParams.get('after') ?? req.headers.get('last-event-id') ?? '0';

    let upstream: Response;
    try {
        upstream = await fetch(
            `${resolved.baseUrl}/runs/${encodeURIComponent(runId)}/events?after=${encodeURIComponent(after)}`,
            { headers: { accept: 'text/event-stream' }, signal: req.signal },
        );
    } catch {
        return NextResponse.json({ error: 'runtime_unreachable', message: 'Could not reach the agent runtime.' }, { status: 502 });
    }
    if (!upstream.ok || !upstream.body) {
        const text = await upstream.text().catch(() => '');
        return NextResponse.json({ error: 'upstream_error', status: upstream.status, message: text.slice(0, 500) }, { status: 502 });
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
