/**
 * Cencori Compute — build pipeline.
 *
 * Deploy a compute_agent from its parent project's linked GitHub repo:
 *   clone (real, via the org's App installation) → detect framework →
 *   adapter build → containerize → run on the provider.
 *
 * v0: the CLONE step is real; adapter/containerize/run are stubbed behind
 * clean boundaries (the Arcie adapter + Fly runtime land next). Each phase
 * updates the deployment row so the dashboard can stream status.
 * See COMPUTE_ARCHITECTURE.md §6, §8.
 */

import type { Octokit } from '@octokit/rest';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { getInstallationOctokit, getInstallationToken } from '@/lib/github';
import { getRuntimeProvider } from '@/lib/compute/runtime';
import { mintAgentApiKey } from '@/lib/compute/api-key';
import { createGithubDetectionContext, detectAgent, EMPTY_MANIFEST, type AgentBuildPlan } from '@/lib/compute/adapters';
import { decryptApiKey } from '@/lib/encryption';

interface DeploymentContext {
    deploymentId: string;
    agentId: string;
    agentSlug: string;
    agentName: string;
    orgId: string;
    projectId: string;
    repoFullName: string; // "owner/repo"
    branch: string;
    rootDir: string;
    framework?: string;
    commitSha?: string;
    createdBy?: string | null;
    /** 'production' (default) updates the agent's live pointer; 'preview' does not. */
    environment?: string;
    /** For preview deploys: the PR to comment the preview URL on. */
    prNumber?: number;
}

/** Gateway base URL the deployed agent calls (usage binds to the project key). */
function gatewayBaseUrl(): string {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://cencori.com';
    return `${base.replace(/\/+$/, '')}/api/v1`;
}

/** Resolve the org's GitHub App installation id (grants repo access). */
async function resolveInstallationId(orgId: string): Promise<number> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('organization_github_installations')
        .select('installation_id')
        .eq('organization_id', orgId)
        .limit(1)
        .maybeSingle();
    const installationId = Number(data?.installation_id);
    if (error || !Number.isFinite(installationId) || installationId <= 0) {
        throw new Error('No GitHub App installation found for this organization');
    }
    return installationId;
}

async function setDeploymentStatus(
    deploymentId: string,
    fields: { status?: string; error_message?: string | null; image_ref?: string; machine_id?: string; commit_sha?: string; hostname?: string; adapter?: string; compatibility?: string; build_plan?: AgentBuildPlan; manifest?: AgentBuildPlan['manifest'] },
): Promise<void> {
    const admin = createAdminClient();
    await admin.from('compute_agent_deployments').update(fields).eq('id', deploymentId);
}

/** Default plan when detection can't run (no installation / GitHub error) — keeps
 *  the loop resilient by assuming the native Arcie shape. */
function fallbackPlan(ctx: DeploymentContext): AgentBuildPlan {
    return {
        adapter: '@cencori/adapter-arcie',
        adapterVersion: '0.1.0',
        compatibility: 'native',
        language: 'node',
        framework: ctx.framework ?? 'arcie',
        rootDirectory: ctx.rootDir,
        packageManager: 'npm',
        installCommand: 'npm ci',
        buildCommand: 'npx arcie build',
        startCommand: 'node .arcie/server.mjs',
        runtime: { baseImage: 'node', languageVersion: '23', port: 8080, healthPath: '/_health' },
        manifest: { ...EMPTY_MANIFEST, streaming: true, humanApprovals: true, session: 'persistent', requiredSecrets: ['CENCORI_API_KEY'] },
        confidence: 0,
    };
}

/**
 * Run the full build+deploy for a deployment. Intended to run out-of-band
 * (queue/worker); for the v0 skeleton it can be awaited by the deploy route.
 */
export async function buildAndDeploy(ctx: DeploymentContext): Promise<void> {
    const admin = createAdminClient();
    const provider = getRuntimeProvider();
    try {
        const [owner, repo] = ctx.repoFullName.split('/');

        // ── 1. Resolve the installation (best-effort — for detection + token) ──
        let octokit: Octokit | null = null;
        let installationId: number | null = null;
        try {
            installationId = await resolveInstallationId(ctx.orgId);
            octokit = await getInstallationOctokit(installationId);
        } catch (e) {
            console.warn('[compute] no GitHub installation for detection:', (e as Error).message);
        }

        // Pin the commit (from the webhook, the branch head, or a mock placeholder).
        let commitSha = ctx.commitSha ?? null;
        if (!commitSha && octokit) {
            try {
                commitSha = (await octokit.rest.repos.getBranch({ owner, repo, branch: ctx.branch })).data.commit.sha;
            } catch { /* fall through to placeholder */ }
        }
        commitSha = commitSha ?? `local${Math.random().toString(16).slice(2, 10)}`;

        // ── 2. Detect the agent → normalized build plan ──────────
        // Static scan of the repo (no execution). Picks the best adapter; falls
        // back to the Arcie shape if detection can't run. See COMPUTE_UNIVERSAL_DEPLOY.md.
        let plan = fallbackPlan(ctx);
        if (octokit) {
            try {
                const dctx = createGithubDetectionContext({ octokit, owner, repo, ref: commitSha, rootDir: ctx.rootDir });
                const outcome = await detectAgent(dctx);
                if (outcome) {
                    plan = outcome.plan;
                    console.log(`[compute] detected ${outcome.displayName} [${plan.compatibility}] conf=${plan.confidence}`);
                }
            } catch (e) {
                console.warn('[compute] detection failed, using fallback:', (e as Error).message);
            }
        }

        await setDeploymentStatus(ctx.deploymentId, {
            status: 'building',
            commit_sha: commitSha,
            adapter: plan.adapter,
            compatibility: plan.compatibility,
            build_plan: plan,
            manifest: plan.manifest,
        });
        console.log(`[compute] ${provider.name} deploy ${ctx.repoFullName}@${commitSha.slice(0, 7)} via ${plan.adapter}`);

        // Container layer: the repo's Dockerfile IS the runtime — the provider
        // builds it (no prebaked base image, no self-build commands injected).
        const isContainer = plan.compatibility === 'container';

        // Base image for the plan's language (Python base lands later; default Node).
        // Unused in container mode — the provider builds from the Dockerfile.
        const imageRef = plan.runtime.baseImage === 'python'
            ? (process.env.FLY_PYTHON_RUNTIME_IMAGE || 'registry.fly.io/cencori-python-runtime:latest')
            : (process.env.FLY_RUNTIME_IMAGE || 'registry.fly.io/cencori-arcie-runtime:latest');

        // ── 3. Runtime env. Base-image deploys self-build from the plan's commands;
        //       container deploys skip them (the Dockerfile owns install/build/start).
        const env: Record<string, string> = {
            PORT: String(plan.runtime.port || 8080),
            CENCORI_API_URL: gatewayBaseUrl(),
            REPO_FULL_NAME: ctx.repoFullName,
            COMMIT_SHA: commitSha,
            ROOT_DIR: ctx.rootDir.replace(/^\/+/, ''),
            FRAMEWORK: plan.framework ?? 'generic',
        };
        if (!isContainer) {
            env.INSTALL_COMMAND = plan.installCommand;
            env.BUILD_COMMAND = plan.buildCommand ?? '';
            env.START_COMMAND = plan.startCommand;
            // Entry point for language shims (e.g. the Python shim reads AGENT_ENTRYPOINT).
            if (plan.entrypoint) env.AGENT_ENTRYPOINT = plan.entrypoint;
        }

        // User-provided agent secrets are encrypted at rest and only decrypted
        // while constructing the runtime environment. Values are never returned
        // to the dashboard or written to deployment logs.
        const { data: storedSecrets, error: secretError } = await admin
            .from('compute_agent_secrets')
            .select('key, encrypted_value')
            .eq('agent_id', ctx.agentId);
        if (secretError) throw new Error('Could not load agent secrets');
        for (const secret of storedSecrets ?? []) {
            if (Object.prototype.hasOwnProperty.call(env, secret.key) || secret.key === 'GITHUB_TOKEN' || secret.key === 'CENCORI_API_KEY') {
                console.warn(`[compute] ignored reserved secret name ${secret.key}`);
                continue;
            }
            env[secret.key] = decryptApiKey(secret.encrypted_value, ctx.orgId);
        }

        // Real machines need live credentials — a clone token + a project key.
        let cloneToken: string | undefined;
        if (provider.name === 'fly') {
            if (!installationId) throw new Error('No GitHub App installation — cannot mint a clone token');
            cloneToken = await getInstallationToken(installationId);
            env.GITHUB_TOKEN = cloneToken;
            env.CENCORI_API_KEY = await mintAgentApiKey(ctx.projectId, ctx.agentName, ctx.createdBy ?? null);
        }

        // Container layer: hand the provider a build spec so it builds the repo's
        // Dockerfile into the image it runs (instead of booting the base image).
        const build = isContainer
            ? {
                  repoFullName: ctx.repoFullName,
                  ref: commitSha,
                  dockerfile: plan.entrypoint || 'Dockerfile',
                  rootDir: ctx.rootDir.replace(/^\/+/, '') || '.',
                  githubToken: cloneToken,
              }
            : undefined;

        // ── 2. Run on the provider ───────────────────────────────
        const machine = await provider.deploy({ agentSlug: ctx.agentSlug, imageRef, env, build });
        const hostname = new URL(machine.url).host;
        const isPreview = (ctx.environment ?? 'production') === 'preview';

        // ── 3. Mark the deployment active (its own URL) ──────────
        await setDeploymentStatus(ctx.deploymentId, { status: 'active', machine_id: machine.machineId, image_ref: imageRef, hostname });

        // Only PRODUCTION cuts the agent's live pointer over. Previews are
        // side deployments — they never touch the agent's endpoint or status.
        if (!isPreview) {
            await admin
                .from('compute_agents')
                .update({ current_deployment_id: ctx.deploymentId, status: 'active', hostname })
                .eq('id', ctx.agentId);
        }
        console.log(`[compute] ${isPreview ? 'preview' : 'production'} deployment ${ctx.deploymentId} active on ${machine.url}`);

        // ── 4. Comment the preview URL on the PR (best-effort) ───
        if (isPreview && ctx.prNumber) {
            try {
                const installationId = await resolveInstallationId(ctx.orgId);
                const octokit = await getInstallationOctokit(installationId);
                const [owner, repo] = ctx.repoFullName.split('/');
                await octokit.rest.issues.createComment({
                    owner,
                    repo,
                    issue_number: ctx.prNumber,
                    body: `🚀 **Preview deployed** — \`${ctx.agentName}\`\n\n${machine.url}\n\n<sub>commit \`${commitSha.slice(0, 7)}\` · Cencori Compute</sub>`,
                });
            } catch (e) {
                console.error('[compute] preview PR comment failed:', e);
            }
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[compute] deployment ${ctx.deploymentId} failed:`, message);
        await setDeploymentStatus(ctx.deploymentId, { status: 'failed', error_message: message });
        // A failed PREVIEW must not mark the live agent failed — only production.
        if ((ctx.environment ?? 'production') !== 'preview') {
            await admin.from('compute_agents').update({ status: 'failed' }).eq('id', ctx.agentId);
        }
    }
}
