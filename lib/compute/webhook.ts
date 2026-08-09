/**
 * Cencori Compute — GitHub events → deploy.
 *
 *   push          → production redeploy (the agent's watched branch)
 *   pull_request  → preview deploy (a throwaway URL for the PR's head), and
 *                   teardown when the PR closes
 *
 * Called from the GitHub App webhook (app/api/scan/webhook) on `push` and
 * `pull_request` events. Requires the App to be subscribed to those events.
 */

import { createAdminClient } from '@/lib/supabaseAdmin';
import { buildAndDeploy } from '@/lib/compute/build';
import { getRuntimeProvider } from '@/lib/compute/runtime';

interface AgentRow {
    id: string;
    slug: string;
    name: string;
    org_id: string;
    project_id: string;
    repo_full_name: string;
    branch: string;
    root_dir: string;
    framework: string;
}
const AGENT_COLS = 'id, slug, name, org_id, project_id, repo_full_name, branch, root_dir, framework';

interface DeployInput {
    commitSha: string;
    branch: string;
    environment: 'production' | 'preview';
    source: 'push' | 'pull_request';
    message?: string | null;
    authorName?: string | null;
    authorLogin?: string | null;
    authorEmail?: string | null;
    prNumber?: number;
}

async function nextVersion(agentId: string): Promise<number> {
    const admin = createAdminClient();
    const { data } = await admin
        .from('compute_agent_deployments')
        .select('version')
        .eq('agent_id', agentId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
    return (data?.version ?? 0) + 1;
}

/** Create the deployment row (with commit metadata) and return its build task. */
async function makeDeployTask(agent: AgentRow, input: DeployInput): Promise<(() => Promise<void>) | null> {
    const admin = createAdminClient();
    const isTeamMember = await resolveIsTeamMember(agent.org_id, input.authorLogin ?? null);
    const version = await nextVersion(agent.id);

    const { data: deployment, error } = await admin
        .from('compute_agent_deployments')
        .insert({
            agent_id: agent.id,
            version,
            status: 'building',
            commit_sha: input.commitSha,
            commit_message: input.message ? input.message.split('\n')[0].slice(0, 200) : null,
            commit_author_name: input.authorName ?? null,
            commit_author_login: input.authorLogin ?? null,
            commit_author_email: input.authorEmail ?? null,
            commit_author_is_team_member: isTeamMember,
            branch: input.branch,
            environment: input.environment,
            source: input.source,
        })
        .select('id')
        .single();
    if (error || !deployment) {
        console.error('[compute webhook] create deployment failed:', error);
        return null;
    }

    return () =>
        buildAndDeploy({
            deploymentId: deployment.id,
            agentId: agent.id,
            agentSlug: agent.slug,
            agentName: agent.name,
            orgId: agent.org_id,
            projectId: agent.project_id,
            repoFullName: agent.repo_full_name,
            branch: input.branch,
            rootDir: agent.root_dir,
            framework: agent.framework,
            commitSha: input.commitSha,
            createdBy: null,
            environment: input.environment,
            prNumber: input.prNumber,
        });
}

// ── push → production ────────────────────────────────────────────────────
interface PushPayload {
    ref?: string;
    repository?: { full_name?: string };
    head_commit?: { id: string; message: string; author: { name?: string; email?: string; username?: string } } | null;
}

export async function handleComputePush(payload: PushPayload): Promise<Array<() => Promise<void>>> {
    const branch = payload.ref?.replace(/^refs\/heads\//, '');
    const repoFullName = payload.repository?.full_name;
    const commit = payload.head_commit;
    if (!branch || !repoFullName || !commit) return [];

    const admin = createAdminClient();
    const { data: agents } = await admin
        .from('compute_agents')
        .select(AGENT_COLS)
        .eq('repo_full_name', repoFullName)
        .eq('branch', branch);
    if (!agents?.length) return [];

    const tasks: Array<() => Promise<void>> = [];
    for (const agent of agents as AgentRow[]) {
        // Production redeploy → the agent goes "building" while it runs.
        await admin.from('compute_agents').update({ status: 'building' }).eq('id', agent.id);
        const task = await makeDeployTask(agent, {
            commitSha: commit.id,
            branch,
            environment: 'production',
            source: 'push',
            message: commit.message,
            authorName: commit.author?.name,
            authorLogin: commit.author?.username,
            authorEmail: commit.author?.email,
        });
        if (task) tasks.push(task);
    }
    return tasks;
}

// ── pull_request → preview ───────────────────────────────────────────────
interface PRPayload {
    action?: string;
    number?: number;
    pull_request?: {
        draft?: boolean;
        title?: string;
        head?: { ref?: string; sha?: string };
        user?: { login?: string };
    };
    repository?: { full_name?: string };
}

export async function handleComputePullRequest(payload: PRPayload): Promise<Array<() => Promise<void>>> {
    const repoFullName = payload.repository?.full_name;
    const pr = payload.pull_request;
    if (!repoFullName || !pr?.head?.ref || !pr.head.sha) return [];

    const admin = createAdminClient();
    // Previews aren't branch-bound — any agent on this repo previews the PR.
    const { data: agents } = await admin.from('compute_agents').select(AGENT_COLS).eq('repo_full_name', repoFullName);
    if (!agents?.length) return [];

    // PR closed/merged → tear down its previews. No new build.
    if (payload.action === 'closed') {
        await teardownPreviews(agents as AgentRow[], pr.head.ref);
        return [];
    }
    if (!['opened', 'synchronize', 'reopened'].includes(payload.action ?? '') || pr.draft) return [];

    const tasks: Array<() => Promise<void>> = [];
    for (const agent of agents as AgentRow[]) {
        // NOTE: no agent status change — production stays live during previews.
        const task = await makeDeployTask(agent, {
            commitSha: pr.head.sha,
            branch: pr.head.ref,
            environment: 'preview',
            source: 'pull_request',
            message: `#${payload.number}: ${pr.title ?? 'preview'}`,
            authorName: pr.user?.login,
            authorLogin: pr.user?.login,
            prNumber: payload.number,
        });
        if (task) tasks.push(task);
    }
    return tasks;
}

/** Stop the preview machines for a PR's branch and mark them stopped. */
async function teardownPreviews(agents: AgentRow[], branch: string): Promise<void> {
    const admin = createAdminClient();
    const provider = getRuntimeProvider();
    for (const agent of agents) {
        const { data: previews } = await admin
            .from('compute_agent_deployments')
            .select('id, machine_id')
            .eq('agent_id', agent.id)
            .eq('environment', 'preview')
            .eq('branch', branch)
            .in('status', ['active', 'building']);
        for (const p of previews ?? []) {
            if (p.machine_id) await provider.stop(p.machine_id).catch(() => undefined);
            await admin.from('compute_agent_deployments').update({ status: 'stopped' }).eq('id', p.id);
        }
    }
}

// ── repository → keep repo binding in sync ───────────────────────────────
interface RepoEventPayload {
    action?: string;
    repository?: { id?: number; full_name?: string };
}

/**
 * A repo an agent is bound to changed. Rename/transfer keep the same repo id,
 * so we re-point `repo_full_name` by `repo_id`. Delete removes the source, so
 * we mark the agent `archived` (deploys would otherwise 404 at clone).
 */
export async function handleComputeRepository(payload: RepoEventPayload): Promise<{ synced: number; archived: number }> {
    const action = payload.action;
    const repo = payload.repository;
    if (!repo?.id || !repo.full_name) return { synced: 0, archived: 0 };
    const admin = createAdminClient();

    if (action === 'renamed' || action === 'transferred') {
        // repo_id is invariant across rename/transfer → re-point the name.
        const { data } = await admin
            .from('compute_agents')
            .update({ repo_full_name: repo.full_name })
            .eq('repo_id', repo.id)
            .neq('repo_full_name', repo.full_name)
            .select('id');
        if (data?.length) console.log(`[compute repo] re-pointed ${data.length} agent(s) → ${repo.full_name}`);
        return { synced: data?.length ?? 0, archived: 0 };
    }

    if (action === 'deleted') {
        const { data } = await admin
            .from('compute_agents')
            .update({ status: 'archived' })
            .or(`repo_id.eq.${repo.id},repo_full_name.eq.${repo.full_name}`)
            .select('id');
        if (data?.length) console.log(`[compute repo] archived ${data.length} agent(s) — repo deleted`);
        return { synced: 0, archived: data?.length ?? 0 };
    }

    return { synced: 0, archived: 0 };
}

/**
 * v0 heuristic: the author is a "team member" if their GitHub login matches one
 * of the org's connected GitHub accounts. Refine later by mapping git authors to
 * Cencori org members once per-user GitHub logins are stored.
 */
async function resolveIsTeamMember(orgId: string, authorLogin: string | null): Promise<boolean> {
    if (!authorLogin) return false;
    const admin = createAdminClient();
    const { data: links } = await admin
        .from('organization_github_installations')
        .select('installation_id')
        .eq('organization_id', orgId);
    const ids = (links ?? []).map((l) => l.installation_id).filter(Boolean);
    if (ids.length === 0) return false;

    const { data: accounts } = await admin
        .from('github_app_installations')
        .select('github_account_login')
        .in('installation_id', ids);
    const logins = (accounts ?? []).map((a) => (a.github_account_login ?? '').toLowerCase());
    return logins.includes(authorLogin.toLowerCase());
}
