/**
 * Shared project-access guard for Cencori Compute routes.
 * Resolves the caller (dashboard session) and confirms owner/admin access.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createServerClient } from '@/lib/supabaseServer';

export interface ProjectAccess {
    projectId: string;
    organizationId: string;
    githubRepoFullName: string | null;
    userId: string;
}

export async function requireProjectAccess(
    projectId: string,
): Promise<{ ok: true; access: ProjectAccess } | { ok: false; response: NextResponse }> {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin
        .from('projects')
        .select('id, organization_id, github_repo_full_name, organizations!inner(owner_id)')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        return { ok: false, response: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
    }

    const ownerId = (project.organizations as { owner_id?: string } | null)?.owner_id || null;
    const isOwner = ownerId === user.id;
    if (!isOwner) {
        const { data: membership } = await admin
            .from('organization_members')
            .select('role')
            .eq('organization_id', project.organization_id)
            .eq('user_id', user.id)
            .maybeSingle();
        if (membership?.role !== 'admin') {
            return { ok: false, response: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }) };
        }
    }

    return {
        ok: true,
        access: {
            projectId: project.id,
            organizationId: project.organization_id,
            githubRepoFullName: project.github_repo_full_name ?? null,
            userId: user.id,
        },
    };
}
