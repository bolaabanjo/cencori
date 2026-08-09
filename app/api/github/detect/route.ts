/**
 * POST /api/github/detect
 *
 * Static agent detection for a repo (no execution) — runs the adapter registry
 * over the repo's manifests/entry points and returns the detected framework +
 * compatibility. The deploy UI calls this the moment a repo is picked, to
 * pre-select the framework dropdown (which the user can still override).
 *
 * Body: { orgSlug, repoFullName, branch?, rootDir? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { getInstallationOctokit } from '@/lib/github';
import { getOrganizationLinkedInstallationIds, getUserOwnedGithubInstallationIds } from '@/lib/github-installations';
import { createGithubDetectionContext, detectAgent } from '@/lib/compute/adapters';

export async function POST(req: NextRequest) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: { orgSlug?: string; repoFullName?: string; branch?: string; rootDir?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const repoFullName = (body.repoFullName ?? '').trim();
    const orgSlug = (body.orgSlug ?? '').trim();
    if (!repoFullName.includes('/') || !orgSlug) {
        return NextResponse.json({ error: 'orgSlug and repoFullName are required' }, { status: 400 });
    }
    const branch = (body.branch ?? '').trim() || 'main';
    const rootDir = (body.rootDir ?? '').trim() || '/';

    // Resolve the org + membership.
    const { data: org } = await supabase.from('organizations').select('id, owner_id').eq('slug', orgSlug).maybeSingle();
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    let hasAccess = org.owner_id === user.id;
    if (!hasAccess) {
        const { data: membership } = await supabase
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', org.id)
            .eq('user_id', user.id)
            .maybeSingle();
        hasAccess = !!membership;
    }
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Resolve a usable installation (org-linked first, then the user's own).
    let installationId = (await getOrganizationLinkedInstallationIds(org.id))[0];
    if (!installationId) installationId = Array.from(await getUserOwnedGithubInstallationIds(user))[0];
    if (!installationId) {
        return NextResponse.json({ detected: false, reason: 'no_installation' });
    }

    try {
        const octokit = await getInstallationOctokit(installationId);
        const [owner, repo] = repoFullName.split('/');
        const ctx = createGithubDetectionContext({ octokit, owner, repo, ref: branch, rootDir });
        const outcome = await detectAgent(ctx);
        if (!outcome) {
            return NextResponse.json({ detected: false });
        }
        return NextResponse.json({
            detected: true,
            framework: outcome.plan.framework ?? null,
            adapter: outcome.plan.adapter,
            displayName: outcome.displayName,
            compatibility: outcome.plan.compatibility,
            confidence: outcome.plan.confidence,
            language: outcome.plan.language,
            entrypoint: outcome.plan.entrypoint ?? null,
        });
    } catch (e) {
        console.error('[detect] error:', e);
        return NextResponse.json({ detected: false, reason: 'error' });
    }
}
