'use server';

import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { slugify } from '@/lib/utils';
import { isReservedProjectSlug } from '@/lib/reserved-slugs';
import { buildAndDeploy } from '@/lib/compute/build';

interface DeployAgentProjectInput {
    orgSlug: string;
    organizationId: string;
    repoId: number;
    repoFullName: string;
    repoHtmlUrl: string;
    repoDescription?: string | null;
    name: string;
    branch: string;
    rootDir: string;
    framework: string;
}

type Result = { ok: true; redirectTo: string } | { ok: false; error: string };

/**
 * Create a project *as* an agent, in one shot: project → compute_agent → first
 * deployment (fires the build pipeline). This is the "vercel new" path for
 * agents — a Cencori project and its agent are born together. Model B keeps
 * them 1:1, so the project name is the agent name.
 */
export async function deployAgentProject(input: DeployAgentProjectInput): Promise<Result> {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { ok: false, error: 'Not signed in.' };

    // Org membership
    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', input.organizationId)
        .eq('user_id', user.id)
        .single();
    if (!membership) return { ok: false, error: 'You do not have access to this organization.' };

    // If this repo is already a project, send them there.
    const { data: existing } = await supabase
        .from('projects')
        .select('slug')
        .eq('github_repo_id', input.repoId)
        .eq('organization_id', input.organizationId)
        .maybeSingle();
    if (existing) return { ok: true, redirectTo: `/${input.orgSlug}/${existing.slug}/deployments` };

    const admin = createAdminClient();

    // Unique project slug (global — matches the DB constraint), skipping reserved.
    const base = slugify(input.name || input.repoFullName.split('/')[1]) || 'agent';
    let slug = base;
    let counter = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (isReservedProjectSlug(slug)) {
            counter += 1;
            slug = `${base}-${counter}`;
            continue;
        }
        const { data: taken } = await admin.from('projects').select('id').eq('slug', slug).maybeSingle();
        if (!taken) break;
        counter += 1;
        slug = `${base}-${counter}`;
        if (counter > 100) { slug = `${base}-${Date.now()}`; break; }
    }

    // 1. Project (carries the repo link, like the import flow).
    const { data: project, error: projectError } = await admin
        .from('projects')
        .insert({
            name: input.name,
            slug,
            description: input.repoDescription ?? null,
            organization_id: input.organizationId,
            github_repo_id: input.repoId,
            github_repo_full_name: input.repoFullName,
            github_repo_url: input.repoHtmlUrl,
            visibility: 'private',
            status: 'active',
        })
        .select('id, slug')
        .single();
    if (projectError || !project) {
        console.error('[deploy-agent] project insert error:', projectError);
        return { ok: false, error: 'Could not create the project.' };
    }

    // 2. The agent (1:1 with the project; same name).
    const { data: agent, error: agentError } = await admin
        .from('compute_agents')
        .insert({
            project_id: project.id,
            org_id: input.organizationId,
            slug: slugify(input.name) || 'agent',
            name: input.name,
            framework: input.framework,
            repo_full_name: input.repoFullName,
            repo_id: input.repoId,
            branch: input.branch,
            root_dir: input.rootDir,
            status: 'building',
        })
        .select('id, slug, branch, root_dir')
        .single();
    if (agentError || !agent) {
        console.error('[deploy-agent] agent insert error:', agentError);
        return { ok: false, error: 'Project created, but the agent could not be set up.' };
    }

    // 3. First deployment + fire the build pipeline (fire-and-forget v0 skeleton).
    const { data: deployment } = await admin
        .from('compute_agent_deployments')
        .insert({ agent_id: agent.id, version: 1, status: 'building', created_by: user.id })
        .select('id')
        .single();

    if (deployment) {
        after(() =>
            buildAndDeploy({
                deploymentId: deployment.id,
                agentId: agent.id,
                agentSlug: agent.slug,
                agentName: input.name,
                orgId: input.organizationId,
                projectId: project.id,
                repoFullName: input.repoFullName,
                branch: agent.branch,
                rootDir: agent.root_dir,
                framework: input.framework,
                createdBy: user.id,
            }).catch((err) => console.error('[deploy-agent] pipeline error:', err)),
        );
    }

    revalidatePath(`/${input.orgSlug}/~/projects`);
    return { ok: true, redirectTo: `/${input.orgSlug}/${project.slug}/deployments/${agent.id}` };
}
