\set ON_ERROR_STOP on

-- Compatibility objects required by the shared Cencori Web migrations when
-- they run in a clean, standalone PostgreSQL database. The Web data plane does
-- not store application users or credentials; it mirrors only project UUIDs
-- when a private project collection is first written.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.projects (
    id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    PRIMARY KEY (organization_id, user_id)
);

\ir ../../supabase/migrations/20260807_120000_cencori_web.sql
\ir ../../supabase/migrations/20260808_000000_web_crawl_frontier.sql
