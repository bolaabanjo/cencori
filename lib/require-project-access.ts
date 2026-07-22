import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';

/**
 * Authorize a dashboard (session-authenticated) request against a specific
 * project. This is the single source of truth for "may the logged-in user
 * touch this project?" — every /api/projects/[projectId]/* route that reads
 * or writes project-scoped data with the admin client MUST call this first,
 * otherwise projectId (a URL-supplied UUID) becomes the only access control.
 *
 * Mirrors the proven inline pattern in end-users/route.ts:
 *   1. require an authenticated session (401 if none)
 *   2. resolve the project's organization (404 if the project is missing)
 *   3. allow the org owner, or any organization_members row (403 otherwise)
 *
 * Usage:
 *   const access = await requireProjectAccess(projectId);
 *   if (!access.ok) return access.response;
 *   // access.userId / access.organizationId are now safe to use
 */
export type ProjectAccessResult =
    | { ok: true; userId: string; organizationId: string }
    | { ok: false; response: NextResponse };

export async function requireProjectAccess(projectId: string): Promise<ProjectAccessResult> {
    const supabase = await createServerClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const supabaseAdmin = createAdminClient();
    const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .select('id, organization_id, organizations!inner(owner_id)')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        return { ok: false, response: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
    }

    const organizationId = project.organization_id as string;
    const ownerId = (project.organizations as { owner_id?: string } | null)?.owner_id || null;

    if (ownerId !== user.id) {
        const { data: membership } = await supabaseAdmin
            .from('organization_members')
            .select('role')
            .eq('organization_id', organizationId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (!membership) {
            return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
        }
    }

    return { ok: true, userId: user.id, organizationId };
}
