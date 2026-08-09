/**
 * Cencori Compute — runtime proxy.
 *
 * The dashboard never talks to an agent's *.fly.dev host directly. These helpers
 * resolve the agent's runtime base URL (behind the project-access guard) and
 * forward the Runtime Contract v2 calls (/runs, /runs/:id, /events, /cancel,
 * /resume). Keeping it same-origin means the browser's session cookie carries
 * auth and the agent's URL/key never reach the client.
 *
 * Local dev: set COMPUTE_RUNTIME_URL_OVERRIDE to a locally-running shim
 * (e.g. http://localhost:8080) to drive the timeline without a real deployment.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireProjectAccess } from '@/lib/compute/access';

type Resolved =
    | { ok: true; baseUrl: string }
    | { ok: false; response: NextResponse };

/** Auth-gate the caller and resolve the agent's runtime base URL. */
export async function resolveAgentBase(projectId: string, agentId: string): Promise<Resolved> {
    const gate = await requireProjectAccess(projectId);
    if (!gate.ok) return { ok: false, response: gate.response };

    const override = process.env.COMPUTE_RUNTIME_URL_OVERRIDE;
    if (override) return { ok: true, baseUrl: override.replace(/\/+$/, '') };

    const admin = createAdminClient();
    const { data: agent } = await admin
        .from('compute_agents')
        .select('hostname')
        .eq('id', agentId)
        .eq('project_id', projectId)
        .maybeSingle();

    if (!agent) {
        return { ok: false, response: NextResponse.json({ error: 'Agent not found' }, { status: 404 }) };
    }
    if (!agent.hostname) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'not_deployed', message: 'This agent has no running deployment yet.' },
                { status: 409 },
            ),
        };
    }
    return { ok: true, baseUrl: `https://${agent.hostname}` };
}

/** Forward a JSON contract call to the runtime and relay its response verbatim. */
export async function forwardJson(baseUrl: string, path: string, method: 'GET' | 'POST', body?: string): Promise<Response> {
    let upstream: Response;
    try {
        upstream = await fetch(`${baseUrl}${path}`, {
            method,
            headers: body != null ? { 'content-type': 'application/json' } : undefined,
            body,
        });
    } catch {
        return NextResponse.json(
            { error: 'runtime_unreachable', message: 'Could not reach the agent runtime.' },
            { status: 502 },
        );
    }
    const text = await upstream.text();
    return new Response(text || '{}', {
        status: upstream.status,
        headers: { 'content-type': 'application/json' },
    });
}
