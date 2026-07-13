'use server';

import { createServerClient } from '@/lib/supabaseServer';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { slugify } from '@/lib/utils';
import { isReservedProjectSlug } from '@/lib/reserved-slugs';

interface ImportGitHubProjectProps {
  orgSlug: string;
  organizationId: string;
  repoId: number;
  repoFullName: string;
  repoHtmlUrl: string;
  repoDescription: string | null;
}

export async function importGitHubProject({
  orgSlug,
  organizationId,
  repoId,
  repoFullName,
  repoHtmlUrl,
  repoDescription
}: ImportGitHubProjectProps) {
  const supabase = await createServerClient();

  // Authenticate user
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('User not authenticated:', userError);
    redirect('/login');
  }

  // Verify organization membership
  const { data: organizationMember, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .single();

  if (memberError || !organizationMember) {
    console.error('User is not a member of this organization:', memberError);
    redirect(`/${orgSlug}/~/projects?error=unauthorized`);
  }

  // Enforce free plan project limit
  const { data: org } = await supabase
    .from('organizations')
    .select('subscription_tier')
    .eq('id', organizationId)
    .single();

  if ((org?.subscription_tier ?? 'free') === 'free') {
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    if ((count ?? 0) >= 1) {
      redirect(`/${orgSlug}/~/projects/import/github?error=project_limit_reached`);
    }
  }

  // Check if repository is already imported
  const { data: existingProject, error: existingError } = await supabase
    .from('projects')
    .select('slug')
    .eq('github_repo_id', repoId)
    .eq('organization_id', organizationId)
    .single();

  if (existingProject) {
    // Repository already imported, redirect to existing project
    redirect(`/${orgSlug}/${existingProject.slug}?info=already_imported`);
  }

  // Generate unique slug from repo name
  const baseSlug = slugify(repoFullName.split('/')[1]) || 'project';

  // Check for slug uniqueness GLOBALLY (not just within org) to match database
  // constraint. Also skip reserved slugs that would collide with an org-level route.
  let slug = baseSlug;
  let counter = 1;
  let slugExists = true;

  while (slugExists) {
    if (isReservedProjectSlug(slug)) {
      counter++;
      slug = `${baseSlug}-${counter}`;
      continue;
    }
    const { data: slugCheck } = await supabase
      .from('projects')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!slugCheck) {
      slugExists = false;
    } else {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }
    if (counter > 100) {
      slug = `${baseSlug}-${Date.now()}`;
      slugExists = false;
    }
  }

  // Insert the new project
  console.log('[Import] Attempting to insert project:', {
    slug,
    name: repoFullName.split('/')[1],
    organizationId,
    githubRepoId: repoId,
  });

  const { data: newProject, error: insertError } = await supabase
    .from('projects')
    .insert({
      name: repoFullName.split('/')[1],
      slug: slug,
      description: repoDescription,
      organization_id: organizationId,
      github_repo_id: repoId,
      github_repo_full_name: repoFullName,
      github_repo_url: repoHtmlUrl,
      visibility: 'private',
      status: 'active',
    })
    .select()
    .single();

  if (insertError) {
    console.error('[Import] Error importing GitHub project:', insertError);
    console.error('[Import] Error details:', JSON.stringify(insertError, null, 2));
    redirect(`/${orgSlug}/~/projects/import/github?error=import_failed&message=${encodeURIComponent(insertError.message)}`);
  }

  // Revalidate paths
  revalidatePath(`/${orgSlug}/~/projects`);
  revalidatePath(`/${orgSlug}/${newProject.slug}`);

  console.log('[Import] Project imported successfully, redirecting to:', `/${orgSlug}/${newProject.slug}`);

  // Redirect to the new project with success message
  redirect(`/${orgSlug}/${newProject.slug}?success=imported`);
}
