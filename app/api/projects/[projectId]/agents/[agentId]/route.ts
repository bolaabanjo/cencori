/**
 * GET /api/projects/:projectId/agents/:agentId
 *
 * One agent's detail + its deployment history (for the Deployments detail view).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireProjectAccess } from '@/lib/compute/access';
import { getRuntimeProvider } from '@/lib/compute/runtime';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; agentId: string }> },
) {
    const { projectId, agentId } = await params;
    const gate = await requireProjectAccess(projectId);
    if (!gate.ok) return gate.response;

    const admin = createAdminClient();

    const { data: agent, error } = await admin
        .from('compute_agents')
        .select('id, slug, name, framework, repo_full_name, repo_id, branch, root_dir, status, hostname, current_deployment_id, created_at, updated_at')
        .eq('id', agentId)
        .eq('project_id', projectId)
        .single();
    if (error || !agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const { data: deployments } = await admin
        .from('compute_agent_deployments')
        .select('id, version, status, commit_sha, commit_message, commit_author_name, commit_author_login, commit_author_email, commit_author_is_team_member, branch, environment, source, adapter, compatibility, manifest, machine_id, image_ref, error_message, created_at, updated_at')
        .eq('agent_id', agentId)
        .order('version', { ascending: false });

    return NextResponse.json({ agent, deployments: deployments ?? [] });
}

/**
 * DELETE /api/projects/:projectId/agents/:agentId
 *
 * Delete the project's agent: stop its machines (best-effort), then remove its
 * deployments and the agent. Frees the project to deploy a new agent (Model B).
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; agentId: string }> },
) {
    const { projectId, agentId } = await params;
    const gate = await requireProjectAccess(projectId);
    if (!gate.ok) return gate.response;

    const admin = createAdminClient();

    const { data: agent } = await admin
        .from('compute_agents')
        .select('id')
        .eq('id', agentId)
        .eq('project_id', projectId)
        .maybeSingle();
    if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Best-effort: stop any running machines before removing the rows.
    const { data: deployments } = await admin
        .from('compute_agent_deployments')
        .select('machine_id')
        .eq('agent_id', agentId);
    const provider = getRuntimeProvider();
    for (const d of deployments ?? []) {
        if (d.machine_id) await provider.stop(d.machine_id).catch(() => undefined);
    }

    await admin.from('compute_agent_deployments').delete().eq('agent_id', agentId);
    const { error } = await admin.from('compute_agents').delete().eq('id', agentId).eq('project_id', projectId);
    if (error) {
        console.error('[agents] delete error:', error);
        return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
