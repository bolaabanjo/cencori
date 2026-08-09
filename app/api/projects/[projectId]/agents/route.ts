/**
 * Cencori Compute — agents for a project.
 *
 * GET  /api/projects/:projectId/agents      — list the project's agents
 * POST /api/projects/:projectId/agents      — create an agent from a chosen repo
 *
 * One agent per project (Model B): the project *is* the agent. It carries the
 * repo (picked at deploy time from the org's connected GitHub accounts, via
 * /api/github/status) and the project is its telemetry/gateway home — usage and
 * logs bind via the project's API key. "Deployments" is this agent's version
 * history. The build/deploy step is a separate action (.../deploy).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireProjectAccess } from '@/lib/compute/access';
import { encryptApiKey } from '@/lib/encryption';

const RESERVED_AGENT_ENV = new Set([
    'PORT',
    'CENCORI_API_KEY',
    'CENCORI_API_URL',
    'REPO_FULL_NAME',
    'COMMIT_SHA',
    'ROOT_DIR',
    'FRAMEWORK',
    'INSTALL_COMMAND',
    'BUILD_COMMAND',
    'START_COMMAND',
    'GITHUB_TOKEN',
]);

function slugify(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'agent';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
    const { projectId } = await params;
    const gate = await requireProjectAccess(projectId);
    if (!gate.ok) return gate.response;

    const admin = createAdminClient();
    const { data: agents, error } = await admin
        .from('compute_agents')
        .select('id, slug, name, framework, repo_full_name, branch, root_dir, status, hostname, current_deployment_id, created_at, updated_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[agents] list error:', error);
        return NextResponse.json({ error: 'Failed to list agents' }, { status: 500 });
    }
    return NextResponse.json({ agents: agents ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
    const { projectId } = await params;
    const gate = await requireProjectAccess(projectId);
    if (!gate.ok) return gate.response;
    const { access } = gate;

    let body: {
        name?: string;
        repoFullName?: string;
        repoId?: number | string;
        branch?: string;
        rootDir?: string;
        framework?: string;
        secrets?: Array<{ key?: string; value?: string }>;
    };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 });
    }

    // The agent carries its own repo, chosen from the org's connected accounts.
    const repoFullName = (body.repoFullName ?? '').trim();
    if (!repoFullName || !repoFullName.includes('/')) {
        return NextResponse.json(
            { error: 'repo_required', message: 'Pick a repository to deploy from.' },
            { status: 400 },
        );
    }
    const repoId = body.repoId != null ? Number(body.repoId) : null;

    const name = (body.name ?? '').trim() || repoFullName.split('/')[1] || 'agent';
    const branch = (body.branch ?? '').trim() || 'main';
    const rootDir = (body.rootDir ?? '').trim() || '/';
    const framework = (body.framework ?? '').trim() || 'arcie';
    const secrets = (body.secrets ?? []).map((secret) => ({
        key: (secret.key ?? '').trim().toUpperCase(),
        value: secret.value ?? '',
    }));
    const secretKeys = secrets.map((secret) => secret.key);

    if (secrets.length > 50) {
        return NextResponse.json({ error: 'too_many_secrets', message: 'Add no more than 50 secrets.' }, { status: 400 });
    }
    if (secrets.some((secret) =>
        !/^[A-Z_][A-Z0-9_]*$/.test(secret.key)
        || !secret.value
        || secret.value.length > 32_768
        || RESERVED_AGENT_ENV.has(secret.key)
    )) {
        return NextResponse.json({
            error: 'invalid_secret',
            message: 'A secret is invalid, empty, reserved by Cencori, or too large.',
        }, { status: 400 });
    }
    if (new Set(secretKeys).size !== secretKeys.length) {
        return NextResponse.json({ error: 'duplicate_secret', message: 'Secret names must be unique.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Model B: one agent per project — the project *is* the agent. Reject a second.
    const { data: existing } = await admin
        .from('compute_agents')
        .select('id')
        .eq('project_id', projectId)
        .limit(1)
        .maybeSingle();
    if (existing) {
        return NextResponse.json(
            { error: 'agent_exists', message: 'This project already has an agent. Create another project to deploy another agent.' },
            { status: 409 },
        );
    }

    // Unique slug within the project (retry with a short suffix on collision).
    const base = slugify(name);
    let slug = base;
    for (let attempt = 0; attempt < 5; attempt++) {
        const { data: created, error } = await admin
            .from('compute_agents')
            .insert({
                project_id: projectId,
                org_id: access.organizationId,
                slug,
                name,
                framework,
                repo_full_name: repoFullName,
                repo_id: repoId,
                branch,
                root_dir: rootDir,
                status: 'created',
            })
            .select('id, slug, name, framework, repo_full_name, branch, root_dir, status, created_at')
            .single();

        if (!error && created) {
            if (secrets.length > 0) {
                const { error: secretError } = await admin.from('compute_agent_secrets').insert(
                    secrets.map((secret) => ({
                        agent_id: created.id,
                        key: secret.key,
                        encrypted_value: encryptApiKey(secret.value, access.organizationId),
                    })),
                );
                if (secretError) {
                    console.error('[agents] secret insert error:', secretError);
                    await admin.from('compute_agents').delete().eq('id', created.id);
                    return NextResponse.json({ error: 'Failed to store agent secrets' }, { status: 500 });
                }
            }
            return NextResponse.json({ agent: created }, { status: 201 });
        }
        // 23505 = unique_violation on (project_id, slug)
        if ((error as { code?: string } | null)?.code === '23505') {
            slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
            continue;
        }
        console.error('[agents] create error:', error);
        return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
    }

    return NextResponse.json({ error: 'slug_conflict', message: 'Could not allocate a unique slug' }, { status: 409 });
}
