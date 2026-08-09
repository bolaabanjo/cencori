import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { getInstallationOctokit } from '@/lib/github';
import {
    getOrganizationLinkedInstallationIds,
    getUserOwnedGithubInstallationIds,
} from '@/lib/github-installations';

interface Repo {
    id: number;
    full_name: string;
    html_url: string;
    description: string | null;
}

async function fetchInstallationRepositories(installationId: number): Promise<Repo[] | null> {
    try {
        const octokit = await getInstallationOctokit(installationId);
        const repositories: Repo[] = [];

        for (let page = 1; ; page += 1) {
            const { data } = await octokit.request('GET /installation/repositories', {
                per_page: 100,
                page,
            });

            repositories.push(...data.repositories.map((repo) => ({
                id: repo.id,
                full_name: repo.full_name,
                html_url: repo.html_url,
                description: repo.description,
            })));

            if (data.repositories.length < 100) break;
        }

        return repositories;
    } catch (error) {
        console.error('[GitHub Status] Error fetching repos for installation', installationId, error);
        return null;
    }
}

/**
 * GET /api/github/status?orgSlug=...
 *
 * Single server-side endpoint for the GitHub import page.
 * Resolves repos from org-linked installations first, then falls back
 * to installations owned by the current user (installed_by_user_id or
 * matching GitHub account login).
 *
 * Returns:
 *  { status: 'not_installed', organizationId }
 *  { status: 'installed', organizationId, installationId, repositories }
 */
export async function GET(req: NextRequest) {
    const supabase = await createServerClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orgSlug = searchParams.get('orgSlug');

    if (!orgSlug) {
        return NextResponse.json({ error: 'Missing orgSlug' }, { status: 400 });
    }

    // Verify org exists and user has access (owner or member)
    const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, slug, owner_id')
        .eq('slug', orgSlug)
        .single();

    if (orgError || !orgData) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    let hasOrgAccess = orgData.owner_id === user.id;
    if (!hasOrgAccess) {
        const { data: membership, error: membershipError } = await supabase
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', orgData.id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (membershipError) {
            console.error('[GitHub Status] Error checking organization membership:', membershipError);
            return NextResponse.json({ error: 'Failed to verify organization access' }, { status: 500 });
        }

        hasOrgAccess = !!membership;
    }

    if (!hasOrgAccess) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const triedInstallationIds = new Set<number>();
        const successfulInstallationIds: number[] = [];
        const repositoriesById = new Map<number, Repo>();

        const collectRepositories = async (installationIds: number[]) => {
            for (const installationId of installationIds) {
                if (triedInstallationIds.has(installationId)) {
                    continue;
                }

                triedInstallationIds.add(installationId);
                const repositories = await fetchInstallationRepositories(installationId);

                if (!repositories) {
                    continue;
                }

                successfulInstallationIds.push(installationId);
                for (const repository of repositories) {
                    repositoriesById.set(repository.id, repository);
                }
            }
        };

        const linkedInstallationIds = await getOrganizationLinkedInstallationIds(orgData.id);
        const linkedInstallationIdSet = new Set(linkedInstallationIds);
        await collectRepositories(linkedInstallationIds);

        if (successfulInstallationIds.length === 0) {
            const userOwnedInstallationIds = Array.from(await getUserOwnedGithubInstallationIds(user));
            const fallbackInstallationIds = userOwnedInstallationIds.filter((id) => !triedInstallationIds.has(id));
            await collectRepositories(fallbackInstallationIds);
        }

        if (successfulInstallationIds.length === 0) {
            return NextResponse.json({
                status: 'not_installed',
                organizationId: orgData.id,
            });
        }

        const fallbackSuccessfulIds = successfulInstallationIds.filter(
            (installationId) => !linkedInstallationIdSet.has(installationId)
        );

        if (fallbackSuccessfulIds.length > 0) {
            const supabaseAdmin = createAdminClient();
            const { error: linkError } = await supabaseAdmin
                .from('organization_github_installations')
                .upsert(
                    fallbackSuccessfulIds.map((installationId) => ({
                        organization_id: orgData.id,
                        installation_id: installationId,
                    })),
                    { onConflict: 'organization_id, installation_id' }
                );

            if (linkError) {
                console.error('[GitHub Status] Failed to persist fallback installation links:', linkError);
            }
        }

        // Account metadata for each connected installation (org can have many).
        const adminForAccounts = createAdminClient();
        const { data: accountRows } = await adminForAccounts
            .from('github_app_installations')
            .select('installation_id, github_account_login, github_account_type, github_account_name')
            .in('installation_id', successfulInstallationIds);
        const connectedAccounts = (accountRows ?? []).map((a) => ({
            installationId: a.installation_id,
            login: a.github_account_login,
            accountType: a.github_account_type,
            name: a.github_account_name,
        }));

        return NextResponse.json({
            status: 'installed',
            organizationId: orgData.id,
            installationId: successfulInstallationIds[0],
            connectedAccounts,
            repositories: Array.from(repositoriesById.values()),
        });
    } catch (error) {
        console.error('[GitHub Status] Unexpected error:', error);
        return NextResponse.json({
            error: 'Failed to fetch GitHub installation status',
        }, { status: 500 });
    }
}
