/**
 * Link (or unlink) a GitHub repo to an EXISTING project.
 *
 * POST   /api/projects/:projectId/repo   — link a repo to this project
 * DELETE /api/projects/:projectId/repo   — unlink the repo
 *
 * This is the missing counterpart to ~/projects/import/github: that flow
 * *creates* a project from a repo, whereas this attaches a repo to a project
 * the user already has (e.g. an empty gateway project they now want to host an
 * agent from). It only writes the repo metadata columns — the project's
 * gateway config (keys, budget, usage) is untouched, so linking a repo never
 * disturbs the AI-gateway work already running on the project.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireProjectAccess } from '@/lib/compute/access';

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
    const { projectId } = await params;
    const gate = await requireProjectAccess(projectId);
    if (!gate.ok) return gate.response;

    let body: { repoFullName?: string; repoId?: number | string; repoUrl?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 });
    }

    const repoFullName = (body.repoFullName ?? '').trim();
    if (!repoFullName || !repoFullName.includes('/')) {
        return NextResponse.json(
            { error: 'bad_request', message: 'repoFullName (owner/name) is required' },
            { status: 400 },
        );
    }
    const repoId = body.repoId != null ? Number(body.repoId) : null;
    const repoUrl = (body.repoUrl ?? `https://github.com/${repoFullName}`).trim();

    const admin = createAdminClient();
    const { data: updated, error } = await admin
        .from('projects')
        .update({
            github_repo_full_name: repoFullName,
            github_repo_id: repoId,
            github_repo_url: repoUrl,
        })
        .eq('id', projectId)
        .select('id, github_repo_full_name, github_repo_id, github_repo_url')
        .single();

    if (error || !updated) {
        console.error('[project repo] link error:', error);
        return NextResponse.json({ error: 'Failed to link repo' }, { status: 500 });
    }

    return NextResponse.json({ project: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
    const { projectId } = await params;
    const gate = await requireProjectAccess(projectId);
    if (!gate.ok) return gate.response;

    const admin = createAdminClient();
    const { error } = await admin
        .from('projects')
        .update({ github_repo_full_name: null, github_repo_id: null, github_repo_url: null })
        .eq('id', projectId);

    if (error) {
        console.error('[project repo] unlink error:', error);
        return NextResponse.json({ error: 'Failed to unlink repo' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
