/**
 * GET /api/organizations/:orgSlug/agents
 *
 * Org-wide agent fleet for the org-level Deployments page. One row per agent
 * (Model B: one agent per project), enriched with its latest PRODUCTION
 * deployment (previews excluded from the fleet, counted separately). Agent-less
 * projects don't appear here — they live under ~/projects.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createServerClient } from '@/lib/supabaseServer';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> },
) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgSlug } = await params;
    const admin = createAdminClient();

    const { data: org, error: orgError } = await admin
        .from('organizations')
        .select('id, owner_id')
        .eq('slug', orgSlug)
        .single();
    if (orgError || !org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Read access: owner or any member.
    let hasAccess = org.owner_id === user.id;
    if (!hasAccess) {
        const { data: membership } = await admin
            .from('organization_members')
            .select('role')
            .eq('organization_id', org.id)
            .eq('user_id', user.id)
            .maybeSingle();
        hasAccess = !!membership;
    }
    if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // The org's projects (for the row link + name fallback).
    const { data: projects } = await admin
        .from('projects')
        .select('id, slug, name')
        .eq('organization_id', org.id);
    const projectMap = new Map((projects ?? []).map((p) => [p.id, p]));
    const projectIds = [...projectMap.keys()];
    if (projectIds.length === 0) return NextResponse.json({ agents: [] });

    // Agents in those projects (Model B: at most one per project).
    const { data: agents, error: agentError } = await admin
        .from('compute_agents')
        .select('id, project_id, slug, name, framework, status, hostname, repo_full_name, current_deployment_id, created_at, updated_at')
        .in('project_id', projectIds);
    if (agentError) {
        console.error('[fleet] agents query error:', agentError);
        return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
    }
    if (!agents || agents.length === 0) return NextResponse.json({ agents: [] });

    // Older deployments predate commit-author capture. Resolve the owner of a
    // connected repository so those rows can still show a useful GitHub face
    // instead of an anonymous initial. The member flag stays grounded in the
    // user who connected that GitHub installation to this organization.
    const repositoryOwners = Array.from(new Set(
        agents
            .map((agent) => agent.repo_full_name?.split('/')[0]?.trim().toLowerCase())
            .filter((owner): owner is string => Boolean(owner)),
    ));
    const repositoryOwnerMembership = new Map<string, boolean>();

    if (repositoryOwners.length > 0) {
        const [{ data: memberships }, { data: installationLinks }] = await Promise.all([
            admin
                .from('organization_members')
                .select('user_id')
                .eq('organization_id', org.id),
            admin
                .from('organization_github_installations')
                .select('installation_id')
                .eq('organization_id', org.id),
        ]);

        const organizationUserIds = new Set<string>([
            org.owner_id,
            ...(memberships ?? []).map((membership) => membership.user_id),
        ]);
        const installationIds = (installationLinks ?? []).map((link) => link.installation_id);

        if (installationIds.length > 0) {
            const { data: installations } = await admin
                .from('github_app_installations')
                .select('github_account_login, installed_by_user_id')
                .in('installation_id', installationIds);

            for (const installation of installations ?? []) {
                const login = installation.github_account_login?.trim().toLowerCase();
                if (!login || !repositoryOwners.includes(login)) continue;
                repositoryOwnerMembership.set(
                    login,
                    Boolean(
                        installation.installed_by_user_id
                        && organizationUserIds.has(installation.installed_by_user_id),
                    ),
                );
            }
        }
    }

    // All deployments for those agents, newest first — we pick the latest
    // production one per agent in JS (NULL-safe; avoids `<> 'preview'` NULL trap).
    const agentIds = agents.map((a) => a.id);
    const { data: deployments } = await admin
        .from('compute_agent_deployments')
        .select('id, agent_id, version, status, commit_sha, commit_message, commit_author_name, commit_author_login, commit_author_email, commit_author_is_team_member, branch, environment, created_at, updated_at')
        .in('agent_id', agentIds)
        .order('version', { ascending: false });

    type DeploymentRow = NonNullable<typeof deployments>[number];
    const latestProd = new Map<string, DeploymentRow>();
    const previewCount = new Map<string, number>();
    for (const d of deployments ?? []) {
        if (d.environment === 'preview') {
            previewCount.set(d.agent_id, (previewCount.get(d.agent_id) ?? 0) + 1);
            continue;
        }
        if (!latestProd.has(d.agent_id)) latestProd.set(d.agent_id, d); // first = highest version
    }

    const rows = agents.map((a) => {
        const project = projectMap.get(a.project_id);
        const dep = latestProd.get(a.id) ?? null;
        return {
            agentId: a.id,
            projectId: a.project_id,
            projectSlug: project?.slug ?? null,
            name: a.name || project?.name || a.slug,
            framework: a.framework,
            status: a.status,
            hostname: a.hostname,
            repoFullName: a.repo_full_name,
            repoOwnerIsTeamMember: a.repo_full_name
                ? (repositoryOwnerMembership.get(a.repo_full_name.split('/')[0].toLowerCase()) ?? false)
                : false,
            created_at: a.created_at,
            updated_at: a.updated_at,
            previewCount: previewCount.get(a.id) ?? 0,
            deployment: dep
                ? {
                      id: dep.id,
                      version: dep.version,
                      status: dep.status,
                      commit_sha: dep.commit_sha,
                      commit_message: dep.commit_message,
                      commit_author_name: dep.commit_author_name,
                      commit_author_login: dep.commit_author_login,
                      commit_author_email: dep.commit_author_email,
                      commit_author_is_team_member: dep.commit_author_is_team_member,
                      branch: dep.branch,
                      created_at: dep.created_at,
                      updated_at: dep.updated_at,
                  }
                : null,
        };
    });

    return NextResponse.json({ agents: rows });
}
