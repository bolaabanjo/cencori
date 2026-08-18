-- Seed: Cencori Public Playground Demo Project
-- Run this in the Supabase SQL editor.
--
-- Idempotent — safe to run multiple times.
-- After running, set these in .env.local:
--   NEXT_PUBLIC_DEMO_PROJECT_ID=<project-uuid>
--   NEXT_PUBLIC_DEMO_ORG_ID=<org-uuid>

-- Create demo org (skips if slug already exists)
insert into public.organizations (
    name, slug, subscription_tier, subscription_status,
    owner_id, monthly_requests_used, credits_balance
)
select
    'Cencori Public Demo', 'cencori-demo', 'free', 'active',
    id, 0, 0
from auth.users
where not exists (select 1 from public.organizations where slug = 'cencori-demo')
order by created_at asc
limit 1;

-- Add owner as member (skips if already a member)
insert into public.organization_members (organization_id, user_id, role)
select o.id, o.owner_id, 'owner'
from public.organizations o
where o.slug = 'cencori-demo'
  and not exists (
      select 1 from public.organization_members m
      where m.organization_id = o.id and m.user_id = o.owner_id
  );

-- Create demo project (skips if slug already exists under the demo org)
insert into public.projects (name, slug, organization_id, visibility, region)
select 'Public Playground', 'public-playground', o.id, 'public', 'americas'
from public.organizations o
where o.slug = 'cencori-demo'
  and not exists (
      select 1 from public.projects p
      where p.slug = 'public-playground' and p.organization_id = o.id
  );

-- Output the IDs (always shows, even if already seeded)
select
    o.id as org_id,
    p.id as project_id
from public.organizations o
join public.projects p on p.organization_id = o.id
where o.slug = 'cencori-demo'
  and p.slug = 'public-playground';
