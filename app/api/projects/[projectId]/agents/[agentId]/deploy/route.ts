/**
 * POST /api/projects/:projectId/agents/:agentId/deploy
 *
 * Create a new deployment for a compute agent and kick the build pipeline
 * (clone the project's linked repo → adapter → container → run). Returns the
 * deployment immediately; the pipeline updates its status out-of-band.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireProjectAccess } from '@/lib/compute/access';
import { buildAndDeploy } from '@/lib/compute/build';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; agentId: string }> },
) {
    const { projectId, agentId } = await params;
    const gate = await requireProjectAccess(projectId);
    if (!gate.ok) return gate.response;
    const { access } = gate;

    const admin = createAdminClient();

    const { data: agent, error: agentError } = await admin
        .from('compute_agents')
        .select('id, slug, name, repo_full_name, branch, root_dir, framework, project_id')
        .eq('id', agentId)
        .eq('project_id', projectId)
        .single();
    if (agentError || !agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    if (!agent.repo_full_name) {
        return NextResponse.json(
            { error: 'no_repo', message: 'This agent has no source repository.' },
            { status: 400 },
        );
    }

    const body = await req.json().catch(() => ({}));
    const sourceDeploymentId = typeof body.sourceDeploymentId === 'string' ? body.sourceDeploymentId : null;
    let sourceCommitSha: string | null = null;

    if (sourceDeploymentId) {
        const { data: sourceDeployment, error: sourceError } = await admin
            .from('compute_agent_deployments')
            .select('id, commit_sha')
            .eq('id', sourceDeploymentId)
            .eq('agent_id', agentId)
            .maybeSingle();

        if (sourceError || !sourceDeployment) {
            return NextResponse.json({ error: 'Source deployment not found' }, { status: 404 });
        }
        if (!sourceDeployment.commit_sha) {
            return NextResponse.json(
                { error: 'missing_commit', message: 'This deployment has no commit to roll back to.' },
                { status: 400 },
            );
        }
        sourceCommitSha = sourceDeployment.commit_sha;
    }

    // Next version = current max + 1.
    const { data: last } = await admin
        .from('compute_agent_deployments')
        .select('version')
        .eq('agent_id', agentId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
    const version = (last?.version ?? 0) + 1;

    const { data: deployment, error: deployError } = await admin
        .from('compute_agent_deployments')
        .insert({
            agent_id: agentId,
            version,
            status: 'building',
            created_by: access.userId,
            commit_sha: sourceCommitSha,
        })
        .select('id, version, status, created_at')
        .single();
    if (deployError || !deployment) {
        console.error('[compute] create deployment error:', deployError);
        return NextResponse.json({ error: 'Failed to create deployment' }, { status: 500 });
    }

    await admin.from('compute_agents').update({ status: 'building' }).eq('id', agentId);

    // Kick the pipeline after the response. `after()` keeps the function alive
    // to finish the (short) server-side work — resolve commit, mint creds, call
    // the runtime provider — so it completes on Vercel, not just on `next dev`.
    // The heavy build runs inside the machine, so this stays well within limits.
    after(() =>
        buildAndDeploy({
            deploymentId: deployment.id,
            agentId: agent.id,
            agentSlug: agent.slug,
            agentName: agent.name,
            orgId: access.organizationId,
            projectId,
            repoFullName: agent.repo_full_name,
            branch: agent.branch,
            rootDir: agent.root_dir,
            framework: agent.framework,
            commitSha: sourceCommitSha ?? undefined,
            createdBy: access.userId,
        }).catch((err) => console.error('[compute] pipeline error:', err)),
    );

    return NextResponse.json({ deployment }, { status: 202 });
}
