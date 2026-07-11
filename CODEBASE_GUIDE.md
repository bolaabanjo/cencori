# Cencori — Codebase Guide

> Orientation doc for an agent/developer working in this repo. Covers what the
> product is, the tech stack, and a directory-by-directory map with the key
> entry points, so you don't have to reverse-engineer the layout.

---

## What Cencori is

A **Cloud Intelligence Provider (CIP)** — "the AWS of AI." It abstracts the hard
parts of production AI (security, orchestration, storage, integrations) behind a
unified platform, exposed as **5 primitives**, plus a standalone security scanner
(**Cencori Scan**). Full product context: `ARCHITECTURE.md`.

**The 5 primitives** (Gateway is the built-out core; the rest are partial/planned):

| # | Primitive | Purpose | Entry point |
|---|---|---|---|
| 1 | **AI Gateway** | One secure API for all model providers; PII/prompt-injection guards, audit logs, streaming, cost attribution | `POST /api/ai/chat`, `POST /api/v1/chat`, `/api/v1/responses` |
| 2 | Compute | Serverless execution for agents (partial) | `/api/agent/*`, `/api/v1/agents` |
| 3 | Workflow | Multi-step agent orchestration, circuit breakers (partial) | n8n connectors under `lib/integrations` |
| 4 | Data Storage | Vector/RAG memory, semantic cache, audit logs | `/api/v1/memory`, `lib/memory`, `lib/cache` |
| 5 | Integration | External connectors + credential vault | `/api/edge-integrations`, `lib/edge-integrations` |

**Cencori Scan** — a security scanner for AI codebases: CLI (`@cencori/scan`,
`npx @cencori/scan`) + web dashboard (`/scan-app`, `/api/scan`), a regex/LLM
detection engine, and AI auto-fix. Code in `lib/scan`, `packages/scan`.

---

## Tech stack

- **Next.js 16.1** (App Router), **React 19.2**, **TypeScript 5**
- **Supabase** (Postgres + RLS + Auth) via `@supabase/ssr` and `@supabase/supabase-js`
- **Tailwind CSS v4**, Ant Design, Radix UI, custom component system
- **Vercel** deploy (see `vercel.json` for rewrites + crons)
- AI providers: OpenAI, Anthropic, Google Gemini, Groq, Cerebras, Cohere, Z.AI
- Upstash Redis + Vector for cache / rate-limiting (fail open if absent)
- Testing: **Vitest** (unit/integration/gateway) + **Playwright** (e2e)
- SDKs: TypeScript, Python, PHP, Rust, Go (`packages/`)

---

## Top-level layout

```
app/          Next.js App Router — pages, route groups, and all API routes
lib/          Core business logic (gateway, scan, memory, billing, providers, safety…)
components/   React components, grouped by feature
packages/     Publishable SDKs + CLI (ts, python, php, rust, scan, create-cencori-app)
database/     Legacy SQL schema + "Phase-2" migrations (see DB note below)
supabase/     Supabase CLI migrations (timestamped) + seed
content/      MDX content (docs/blog/academy)
docs/         Internal docs (onboarding, RFCs, security, sales)
config/       Static site config (site.ts, partners, examples)
hooks/        Shared React hooks
internal/     Internal analytics + feedback modules
types/        Ambient TS type declarations
scripts/      One-off / operational TS+MJS scripts
e2e/          Playwright specs;  __tests__/  Vitest suites
proxy.ts      Edge middleware: Supabase session refresh, security headers, rewrites
cencori-go/   Go SDK/runtime pieces
```

---

## `app/` — routes

Route **groups** (parenthesized = URL-invisible grouping):

- `(marketing)`, `(products)`, `(legal)`, `(docs)` — public site
- `dashboard/` — the authenticated product UI (projects, orgs, billing, API keys,
  providers, settings; `dashboard/organizations/new` creates an org)
- `scan-app/`, `ai/`, `chat/`, `playground/`, `academy/`, `pitch/`, `pricing/`,
  `compare/`, `solutions/`, `newsletter/`, `invite/`, `team-invite/`
- `login/`, `signup/`, `internal/` (admin-only tooling)
- `layout.tsx`, `page.tsx`, `globals.css`, `sitemap.ts`, `robots.ts`, `og/`

### `app/api/` — server routes (grouped by domain)

```
ai/          gateway chat entry (/api/ai/chat)          v1/          public API surface (see below)
agent/       agent runtime + polling                    projects/    per-project resources (keys, logs, budgets, end-users)
auth/        session/signup helpers                     organizations/ org management
billing/     subscriptions, credits, webhooks           providers/   provider config
chat/ ask-ai/ arcie/  assistant surfaces                memory/      RAG memory API
scan/        scanner + GitHub PR integration            edge-integrations/  connectors
github/      GitHub App install + webhooks              email/ newsletter/ feedback/ contact/
cron/        scheduled jobs (see vercel.json crons)     user/ users/ invites/  identity
health/      liveness                                    docs/ og/ versions/ waitlist/ pitch/
```

**Public API (`app/api/v1/…`)** — the versioned surface exposed to customers
(rewritten from `/v1/*` in `vercel.json`):
`chat`, `responses`, `models`, `agents`, `agent`, `memory`, `sessions`,
`billing`, `metrics`, `public-metrics`, `telemetry`.

---

## `lib/` — where the logic lives

Grouped by domain (files, not exhaustive):

**AI Gateway** (`lib/gateway/`): the request pipeline.
- `ai-chat-handler.ts`, `chat-executor.ts` — orchestrate a chat request
- `input-guard.ts`, `output-guard.ts`, `custom-rules.ts`, `guard-types.ts` —
  the security layer (PII / prompt-injection / content filtering)
- `providers-setup.ts` — provider selection/fallback
- `session-engine.ts`, `session-types.ts` — agent sessions
- `v1-execute.ts`, `v1-responses-*.ts` — the `/api/v1` execution paths
- Reliability/middleware: `lib/gateway-reliability.ts`, `lib/gateway-middleware.ts`

**Providers** (`lib/providers/`, `lib/gemini.ts`): adapters per model provider.

**Memory / RAG** (`lib/memory/`): `embeddings.ts`, `retrieval.ts`, `extraction.ts`,
`writeback.ts`, `redact.ts`, `quota.ts`, `session-store.ts`.

**Cache** (`lib/cache/`, `lib/cache.ts`, `lib/config-cache.ts`): semantic + config cache.

**Scan** (`lib/scan/`): `repository-scan.ts`, `dependency-scanner.ts`, `pr-scan.ts`,
`ai-fix-suggestions.ts`, `policy.ts`, `github-access.ts`, `webhook-verify.ts`.

**Billing / usage** (many files): `credits.ts`, `usage.ts`, `budgets.ts`,
`end-user-billing.ts`, `project-credit-billing.ts`, `entitlements.ts`,
`require-tier-feature.ts`, `invoice-generation.ts`, `stripe-connect.ts`,
`bachsClient.ts`, `currency.ts`.

**Auth / access**: `internal-access.ts`, `internal-admin-auth.ts`,
`auth-redirect.ts`, `supabase-sso.ts`, `require-tier-feature.ts`.

**Supabase clients**:
- `lib/supabaseClient.ts` — browser (publishable key)
- `lib/supabaseServer.ts` — SSR w/ cookies (publishable key)
- `lib/supabaseAdmin.ts` — service-role admin (bypasses RLS; server only)

**Other**: `api-keys.ts`, `webhooks.ts`, `audit-log.ts`, `track-event.ts`,
`rate-limit.ts`, `queue.ts`, `encryption.ts` (BYOK key encryption — needs
`ENCRYPTION_SECRET`), `email/`, `documents/`, `vision/`, `safety/`, `integrations/`,
`edge-integrations/`, `github*.ts`, `storage-buckets.ts`.

---

## `components/`

Feature-grouped: `dashboard/`, `chat/`, `scan/`, `billing/`, `api-keys/`,
`providers/` (via `models/`, `logos/`), `auth/`, `security/`, `audit/`, `prompts/`,
`cache/`, `arcie/`, `academy/`, `docs/`, `landing/`, `sections/`, `blog/`,
`ai-elements/`, `animate-ui/`, `icons/`, `brand/`. Root primitives like
`login-form.tsx`, `logo.tsx`, `codeblock.tsx`, `PostHogProvider.tsx`.

---

## `packages/` — publishable SDKs & CLI

| Package | What |
|---|---|
| `sdk/` | TypeScript SDK (`@cencori/sdk`) — includes a Vercel AI SDK provider |
| `python-sdk/` | Python SDK |
| `sdk-php/`, `sdk-rust/` | PHP + Rust SDKs |
| `scan/` | `@cencori/scan` CLI (the scanner) |
| `create-cencori-app/` | `npm create cencori-app` scaffolder |

Each is independently built (`tsup`) and versioned; see `packages/PUBLISHING.md`.

---

## Config, middleware & tooling

- **`proxy.ts`** — edge middleware: refreshes the Supabase session, injects
  security headers (CSP/HSTS/X-Frame-Options…), and applies rewrites.
- **`vercel.json`** — `/v1/*` → `/api/v1/*` rewrites and **cron** definitions
  (scheduled jobs hit `/api/cron/*`; see also `VERCEL_CRON_SETUP.md`).
- `next.config.ts`, `tsconfig.json`, `tsconfig.scripts.json`,
  `eslint.config.mjs`, `postcss.config.mjs`, `components.json` (shadcn-style),
  `source.config.ts` (Fumadocs content).
- Tests: `vitest.config.ts` (+ `vitest.integration.config.ts`,
  `vitest.gateway.config.ts`), `playwright.config.ts`.

### npm scripts

```
dev            next dev  (http://localhost:3000)
build / start  production build / serve
lint           eslint
test / test:run          vitest (watch / once)
test:integration         vitest --config vitest.integration.config.ts
test:gateway             vitest --config vitest.gateway.config.ts
e2e / e2e:ui / e2e:security   playwright
```

---

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in values (see below)
npm run dev
```

**Required env** (app won't boot without the first three):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, plus `ENCRYPTION_SECRET` (32+ chars) and **≥1 AI
provider key** (e.g. `GEMINI_API_KEY`) for gateway calls. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
and `SUPABASE_JWT_SECRET` are used by some routes. See `.env.example` for the full,
annotated list (Redis, billing, GitHub App, email — all optional for basic dev).

> **Auth/org note:** there is no `auth.users` trigger — orgs/memberships are
> created by the app (`app/dashboard/organizations/new`, `app/api/internal/auth/signup`).
> A brand-new user has no org, so org-scoped dashboard pages are empty until a
> first org + `organization_members` row exists. App RLS keys off
> `organization_members` and `organizations.owner_id`.

---

## Database (brief)

The schema lives across two migration sets — `database/migrations/*.sql` (legacy,
manually applied) and `supabase/migrations/*.sql` (Supabase CLI, timestamped).
The connected Supabase project is already fully migrated. If you need the full
story on how the schema was bootstrapped (a reconstructed base schema + apply
order + a Management-API runner in `scripts/apply-migrations.mjs`), that's written
up separately in `LOCAL_DEV_HANDOFF.md`. For normal dev you don't need to touch it.

---

## Where to start for common tasks

| Task | Start here |
|---|---|
| Change gateway request handling / guards | `lib/gateway/` (`ai-chat-handler.ts`, `input-guard.ts`) |
| Add/modify a public API endpoint | `app/api/v1/<name>/route.ts` + `lib/gateway/v1-*.ts` |
| Provider routing / add a provider | `lib/providers/`, `lib/gateway/providers-setup.ts` |
| Billing / credits / entitlements | `lib/credits.ts`, `lib/usage.ts`, `lib/entitlements.ts` |
| RAG / memory | `lib/memory/`, `app/api/v1/memory/` |
| Scanner behavior | `lib/scan/`, `packages/scan/` |
| Dashboard UI | `app/dashboard/`, `components/dashboard/` |
| Auth/session/headers | `proxy.ts`, `lib/supabase*.ts` |
| Scheduled jobs | `app/api/cron/`, `vercel.json`, `VERCEL_CRON_SETUP.md` |
```
