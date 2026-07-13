'use server';

/**
 * Org-level settings server actions.
 *
 * Auth model: only owners/admins can update org attributes. Only owners
 * can delete. Slug changes are validated (kebab-case, reserved words,
 * unique) and cascade — the caller receives the new slug so the client
 * can navigate to it.
 */

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { validateOrgSlug } from '@/lib/reserved-slugs';

interface ActionResult<T = null> {
    ok: boolean;
    error?: string;
    data?: T;
}

async function requireOwnerOrAdmin(orgSlug: string): Promise<
    | { ok: true; orgId: string; userId: string; role: string }
    | { ok: false; error: string; status: number }
> {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { ok: false, error: 'Not signed in.', status: 401 };

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();
    if (!org) return { ok: false, error: 'Organization not found.', status: 404 };

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .single();
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return { ok: false, error: 'You need owner or admin role for this action.', status: 403 };
    }

    return { ok: true, orgId: org.id, userId: user.id, role: membership.role };
}

export async function updateOrgName(orgSlug: string, newName: string): Promise<ActionResult> {
    const trimmed = newName.trim();
    if (!trimmed) return { ok: false, error: 'Organization name cannot be empty.' };
    if (trimmed.length > 48) return { ok: false, error: 'Name must be 48 characters or fewer.' };

    const auth = await requireOwnerOrAdmin(orgSlug);
    if (!auth.ok) return { ok: false, error: auth.error };

    const admin = createAdminClient();
    const { error } = await admin
        .from('organizations')
        .update({ name: trimmed })
        .eq('id', auth.orgId);
    if (error) {
        console.error('[Org Settings] updateOrgName failed:', error);
        return { ok: false, error: 'Could not update organization name.' };
    }

    revalidatePath(`/${orgSlug}`, 'layout');
    return { ok: true };
}

export async function updateOrgSlug(
    orgSlug: string,
    newSlug: string
): Promise<ActionResult<{ newSlug: string }>> {
    const trimmed = newSlug.trim().toLowerCase();
    const validationError = validateOrgSlug(trimmed);
    if (validationError) return { ok: false, error: validationError };
    if (trimmed === orgSlug) return { ok: true, data: { newSlug: trimmed } };

    const auth = await requireOwnerOrAdmin(orgSlug);
    if (!auth.ok) return { ok: false, error: auth.error };

    const admin = createAdminClient();
    const { data: conflict } = await admin
        .from('organizations')
        .select('id')
        .eq('slug', trimmed)
        .maybeSingle();
    if (conflict) {
        return { ok: false, error: 'That URL is already taken.' };
    }

    const { error } = await admin
        .from('organizations')
        .update({ slug: trimmed })
        .eq('id', auth.orgId);
    if (error) {
        console.error('[Org Settings] updateOrgSlug failed:', error);
        return { ok: false, error: 'Could not update organization URL.' };
    }

    revalidatePath('/dashboard', 'layout');
    return { ok: true, data: { newSlug: trimmed } };
}

export async function deleteOrganization(
    orgSlug: string,
    confirmSlug: string
): Promise<ActionResult> {
    if (confirmSlug.trim() !== orgSlug) {
        return { ok: false, error: 'The confirmation text does not match.' };
    }

    const auth = await requireOwnerOrAdmin(orgSlug);
    if (!auth.ok) return { ok: false, error: auth.error };
    if (auth.role !== 'owner') {
        return { ok: false, error: 'Only the organization owner can delete this organization.' };
    }

    const admin = createAdminClient();
    const { error } = await admin
        .from('organizations')
        .delete()
        .eq('id', auth.orgId);
    if (error) {
        console.error('[Org Settings] deleteOrganization failed:', error);
        return { ok: false, error: 'Could not delete organization.' };
    }

    return { ok: true };
}
