# Cencori Compute — Agent Hosting & Deploy

> **Status:** v0.5 — Git-first, Model B. Runtime **wired** (Fly, env-gated + local mock); **`git push` → production auto-deploy** and **PR → preview deploy** both built. **Universal deploy** (adapter SDK + detection + container layer) and the **run lifecycle** (streaming runs + suspend/resume, both shims) shipped, with a dashboard proxy + live timeline (§4, §14; spec in `COMPUTE_UNIVERSAL_DEPLOY.md`). Owner: Bola. Updated 2026-07-31. Flip-live checklist: `COMPUTE_RUNTIME_SETUP.md`.
> **One line:** "Do you host agents?" → **yes.** New project ▸ Deploy an agent → pick a repo → Cencori builds and runs it — sessions, models, memory, scheduling, billing, and guardrails already wired. One project = one agent; "Deployments" is its version history. Push to redeploy; open a PR for a preview URL.

---

## 1. What we're building

A managed runtime that **hosts and runs agents** straight from a GitHub repo. The developer picks a repo (`New project ▸ Deploy an agent`), and Cencori creates the project, builds the agent, and runs it 24/7 — public endpoint, channel webhooks, schedules — no servers, no Dockerfiles, no CLI required. A project maps 1:1 to an agent; **"Deployments" is the agent's version history.**

It's the execution layer that closes the stack:

```
Gateway (models) → Sessions (orchestration) → Memory → COMPUTE (execution)
```

Compute, **agent-shaped**. We don't compete with Lambda/Workers on generic execution — we host *agents*, with the whole AI stack under them.

## 2. Design principles

1. **Git-first, one agent per project (Model B).** A Cencori project maps **1:1** to a deployed agent — the project *is* the agent. The agent carries its **own** repo (`compute_agents.repo_full_name` / `repo_id`), picked from the org's connected GitHub accounts; the org already has the App installed (`organization_github_installations`), so **deploy reuses that link — no second connect, no re-auth.** The project is the boundary: the agent's usage / logs / observability bind to it **via the project's API key** — the same whether Cencori-deployed or run locally (`arcie dev`). **"Deployments" is the agent's version history** (v1, v2… at different commits — the Vercel model). A project may also be **agent-less** (pure gateway/SDK use); Compute is opt-in. Want a second agent → a second project.
2. **Framework-agnostic platform, framework adapters.** The platform runs a container that satisfies a **Runtime Contract** (§4). **Arcie is the first adapter.** LangGraph / CrewAI / raw code come later with their own adapters; the platform never learns "Arcie."
3. **Reuse the stack.** Sessions API runs the turn loop, the gateway routes models + meters spend, gateway memory persists state, cron fires schedules, credits bill, Arcie **policies** enforce guardrails. Compute adds *build + execution + ingress + lifecycle* only.
4. **Wrap, then build.** v0 runs agents on a managed container provider Cencori orchestrates (Fly Machines / Cloudflare Containers / Fargate). Build our own isolate runtime later, for margin + moat.

## 3. Why a container (no declarative shortcut)

Arcie agents are **code**: `defineTool` / `defineChannel` / `defineSchedule` all require a JS `execute`/`handler`, and `arcie build`'s `manifest.json` only holds their *names*. Hosting an agent = **running the developer's code = one isolated container per agent.** That container is the single hard new primitive; everything else already exists.

## 4. The Runtime Contract (the core abstraction)

A deployed agent is a container that answers a fixed set of HTTP routes on `$PORT`. The platform speaks only this — that's what makes it framework-agnostic. `POST /invoke` is the sync-sugar entry; the **run lifecycle** (start / stream / inspect / cancel / resume) is the full surface (see `COMPUTE_UNIVERSAL_DEPLOY.md` §4 for the expanded spec and normalized event vocabulary).

| Method / Path | Purpose |
|---|---|
| `GET /_health` | Liveness/readiness. |
| `GET /_manifest` | Agent manifest (capabilities, channels, schedules, policy) + `contract`/`streaming` flags. |
| `POST /invoke` | Sync sugar — run to completion. `{ input }` → `{ output }`. |
| `POST /runs` | Start an async run → `{ id, status }`. |
| `GET /runs/:id` | Run state (status, output/error, suspend info). |
| `GET /runs/:id/events` | **SSE** normalized event stream (`?after=<seq>` to resume). |
| `POST /runs/:id/cancel` | Cancel an in-flight/suspended run. |
| `POST /runs/:id/resume` | Resume a suspended run (human approval / interrupt). |
| `POST /channels/:channel` | Verified inbound channel event (Slack/Discord/HTTP). |
| `POST /schedules/:name` | Fire a named schedule handler (platform cron calls this). |

**Shipped (2026-07-31):** the run lifecycle + normalized events + suspend/resume live in both shims (`compute/runtime/cencori-shim.mjs`, `compute/runtime/python/cencori_shim.py`); the dashboard reaches them through a same-origin proxy (`/api/projects/:pid/agents/:aid/runs/*`) and renders them in `components/compute/RunTimeline.tsx`. Channels/schedules remain v1.

**Injected env:** `CENCORI_API_KEY` (project-scoped), `CENCORI_API_URL`, `PORT`, `AGENT_ENTRYPOINT`, `FRAMEWORK`, agent secrets, policy/budget. The agent's runner uses that key to hit the Sessions API — turns, model routing, and billing flow through Cencori automatically. An adapter's only job is to make its framework answer these routes (via its native server, or the shim).

### 4.1 The frontend — Arcie's own UI standard (static, deployed with the agent)

Arcie is a **full-stack agent framework**, not "an agent backend you bolt a frontend onto." Its UI is a first-class part of the framework **with its own standard** — you learn *Arcie* (like you learn Next.js or SvelteKit) and write the frontend the Arcie way. You do **not** bring or mix Vite/Next/TanStack; Arcie is the one framework. (Not named `arcie.js` — it's just Arcie.)

- **The Arcie UI standard** — React under the hood (for the ecosystem), but the *standard is Arcie's*: a component kit (`<AgentChat>`, tool-call cards, activity/thinking timeline, message, markdown), hooks (`useAgent`, `useInvoke`, `useSession`, `useMemory`), theming, and directory conventions. Also exposed as the `<agent-chat>` **web component** for embeds. The model is wired to the **Cencori gateway** via the injected key.
- **One toolchain.** `arcie build` compiles the frontend to **static assets** — the developer never touches a bundler config. Static (not a running server) is exactly what keeps the *runtime* a clean single framework: the frontend is a build artifact, not a second process.
- **Works both ways** (all within Arcie): the scaffold ships a prewired default UI that works instantly → customize it deeply in the Arcie idiom ("go crazy") → or delete it (no frontend → Cencori serves the default `<agent-chat>` host page). Not "swap in Next."

**Deploy = two outputs, one framework, one command.** `arcie deploy` produces (a) the **RC container** (headless agent runtime) and (b) the **static frontend**. Ingress on `<hostname>.cencori.app` serves the frontend at `/` and routes `/invoke` (+ `/channels`) to the container — same-origin, zero CORS, isolated per agent (§8.1).

- **`arcie dev`** serves the Arcie UI + all RC routes on one port — instant local test, no external framework.
- **Cencori dashboard test chat** and **customer embeds** reuse the `<agent-chat>` web component; Cencori's own Next.js dashboard is untouched (it just drops in `<agent-chat>`).
- **RC container stays headless** — the frontend is a static layer, never one of the 5 routes.

> **v0 constraint:** static/SPA frontends only (≈ all agent UIs). A frontend needing true SSR / its own server is a later, bigger option (a second runtime), not two frameworks in one container.

> **Track B / Arcie repo:** `<agent-chat>` (done). The broader **Arcie UI standard** — component kit, hooks, conventions, theming, and a *"How to build with Arcie"* doc — is its own Arcie-repo design effort (§16).

## 5. Deploy sources — one pipeline

Multiple entry points, **one build+run pipeline** behind the deploy API:

| Source | Phase | Notes |
|---|---|---|
| **Git** (the agent's repo) | **v0** | The lean path — repo picked from the org's connected accounts; App install already exists. Push → auto-redeploy. |
| **Template** | v1 | One-click starter → forks a repo into the user's account, then same Git path. |
| **CLI** (`arcie deploy`) | v2 | Power users; pushes a prebuilt artifact to the same deploy API. |

Everything funnels to: **build (clone → adapter → container) → run (provider) → wire ingress + schedules.**

## 6. Git-first deploy flow (one agent per project)

Two entry points, one pipeline. Because project ↔ agent is 1:1, deploying is
also a **project-creation** path (`vercel new` for agents):

- **A — New project *as* an agent (primary):** `New project ▸ Deploy an agent` →
  pick a repo from connected GitHub → one **Project name** (= the agent's name) →
  a server action creates **project + agent + deployment v1** atomically, then
  redirects to the deployment view. *(`~/projects/new-agent`, `deployAgentProject`.)*
- **B — Deploy inside an existing agent-less project:** the project's **Deployments**
  tab shows the repo picker; picking a repo creates the agent + first deployment.

Both funnel to the same build:

```
 Pick repo (from org's connected accounts) → name + branch + root dir + framework
    │
    ▼
 POST /api/projects/:id/agents   →   .../agents/:agentId/deploy   (create agent + deployment v1)
    │  one agent per project — a second create returns 409 agent_exists
    ▼
 BUILD PIPELINE (server-side)
    │  getInstallationOctokit(installation_id)            (lib/github.ts)
    │  → download tarball(repo, branch) → extract          (workspace)
    │  → detect framework (arcie: agent/agent.ts)
    │  → run adapter: bundle tools/channels/schedules + contract server
    │  → containerize (prebaked base image + bundle)
    ▼
 RUN (provider): create machine (scale-to-zero), inject
    │  CENCORI_API_KEY (project-scoped), secrets, policy
    ▼
 WIRE ingress:  <hostname>.cencori.app                  → /invoke
                <hostname>.cencori.app/channels/slack  → verified webhook → /channels/slack
        cron:   manifest.schedules[].cron         → /schedules/<name>
    │
    ▼
 Health green → deployment "active" → show URL + live test chat
```

Turns from `/invoke` → the agent's runner → **Sessions API** → gateway (models, spend, security). Tools execute **inside the agent container**. Subsequent `git push` → GitHub App webhook (same one Scan uses) → rebuild → atomic cutover.

## 7. Deploy tab — UI sketch

The deploy experience lives **on the project** as the **Deployments** section
(nav renamed from "Agents"). Because project ↔ agent is 1:1:

- **Agent-less project** → Deployments shows the **repo picker** (deploy the one
  agent; repos listed directly from the org's connected accounts, since the App
  is installed org-wide). If the App isn't installed yet → fall back to
  `~/projects/import/github` to install it.
- **Has an agent** → `/deployments` **redirects to that agent** — the detail page
  *is* the Deployments view. **Deployments = the agent's version history.**

### 7.1 Deployments — empty state (agent-less project)

```
┌ Project: support-agent ───────────────────────────────────────────────────────────┐
│  Overview   AI Gateway   Deployments ▮   Logs   Settings                            │
├───────────────────────────────────────────────────────────────────────────────────┤
│  Deploy from a repository                          Connected: @acme  @bolaabanjo    │
│  ┌───────────────────────────────────────────────────────────────────┐             │
│  │ 🔍 Search repositories…                                            │             │
│  ├───────────────────────────────────────────────────────────────────┤             │
│  │ ⌗ acme/support-agent   TypeScript · 5h ago              [ Deploy ] │             │
│  │ ⌗ acme/ops-bot         Python · 1w ago                  [ Deploy ] │             │
│  └───────────────────────────────────────────────────────────────────┘             │
└───────────────────────────────────────────────────────────────────────────────────┘
```

*(Picking a repo opens the configure dialog — name / branch / root dir / framework
(auto-detected, overridable) — then creates the agent + first deployment.)*

### 7.2 Deploy config (drawer/modal)

```
┌ Deploy agent ─────────────────────────────────────────────┐
│  Repo        acme/support-agent            (linked)        │
│  Branch      [ main ▾ ]                                    │
│  Root dir    [ /agent            ]  ⌥ arcie detected       │
│  Region      [ US-East ▾ ]                                 │
│                                                            │
│  Environment variables                                     │
│   ┌──────────────┬───────────────────────────┐  [+ Add]   │
│   │ SLACK_TOKEN  │ ••••••••••••••••          │            │
│   │ DB_URL       │ ••••••••••••••••          │            │
│   └──────────────┴───────────────────────────┘            │
│                                                            │
│  Guardrails      Budget [ $50 / mo ]   from agent policy   │
│                  Models  allow-list from policy            │
│                                                            │
│                                   [ Cancel ]  [ Deploy ▸ ] │
└────────────────────────────────────────────────────────────┘
```

### 7.3 Building (live logs)

```
┌ Deploying  support-agent · v1 ────────────────────────────┐
│  ● Cloning acme/support-agent@main                    ✓    │
│  ● Detecting framework … arcie                        ✓    │
│  ● Building bundle (6 tools · 1 channel · 2 schedules)✓    │
│  ● Packaging container                                ✓    │
│  ● Booting machine (US-East)                          ◐    │
│  ○ Health check                                            │
│                                                            │
│   › installed 214 packages in 8s                           │
│   › bundle 1.2mb                                           │
│   › machine i-9f3a starting…                               │
│                                        Status: Deploying   │
└────────────────────────────────────────────────────────────┘
```

### 7.4 Agent detail (live)

```
┌ support-agent  ● Live ───────────  support-agent-a1b2.cencori.app  ⧉ ┐
│  Overview ▮  Channels   Schedules   Logs   Versions   Settings            │
├───────────────────────────────────────────────────────────────────────────┤
│  Endpoint  https://support-agent-a1b2.cencori.app          [Copy] [⧉]   │
│  Source    acme/support-agent @ main /agent · v1 · deployed 2m ago         │
│  Model     claude-sonnet-5   ·   Budget $12.40 / $50.00                    │
│                                                                            │
│  ┌ Test your agent ───────────────────────────────────────────────┐       │
│  │  you › a customer says their card was declined, what do I do?   │       │
│  │  support-agent › I checked the last 3 failed charges…           │       │
│  │  [ type a message…                                     ] [Send] │       │
│  └────────────────────────────────────────────────────────────────┘       │
│                                                                            │
│  Channels   ⧉ Slack  Not connected  [Connect]   Discord  [Connect]         │
│  Schedules  daily-digest  0 9 * * *   next 9:00 AM   ●on                    │
│  Embed      <AgentChat agentId="support-agent" />              [Copy]       │
└───────────────────────────────────────────────────────────────────────────┘
```

The **test chat** on the detail page is the payoff — the moment "deploy" turns into "it's alive and I'm talking to it."

## 8. Build pipeline (server-side)

**The build happens *inside the machine*, not on the server** — a Vercel function can't run Docker. So the deploy API does only light work, and one prebaked, **self-building** base image does the rest. No Docker-in-serverless, no build worker.

**Deploy API** (`lib/compute/build.ts` → `buildAndDeploy`, run via **`after()`** so it survives the serverless response — see §14):
1. Pin the commit — `agent.repo_full_name` @ branch → sha via the org's App installation.
2. Mint credentials — a short-lived **clone token** (`getInstallationToken`) + a fresh **project-scoped `CENCORI_API_KEY`** (`mintAgentApiKey`; stored hashed, injected in the clear once). *(Only in real/`fly` mode — the mock provider boots nothing.)*
3. Call the runtime provider with the base image + env: `REPO_FULL_NAME`, `COMMIT_SHA`, `ROOT_DIR`, `GITHUB_TOKEN`, `CENCORI_API_KEY`, `CENCORI_API_URL`, `PORT`.

**Base runtime image** (`compute/runtime/{Dockerfile,entrypoint.sh}`, **Node ≥23.6** — agent tool `.ts` files are imported at runtime via native type-stripping): on boot the machine clones the repo@commit, `npm ci`, `arcie build` → `.arcie/server.mjs`, and serves the Runtime Contract on `$PORT`. Cold starts rebuild (v1 caches/snapshots).

**Env-gated provider** (§9): `flyProvider` when `FLY_API_TOKEN` is set, else `localProvider` (mock). **Production** deploys cut the agent's live pointer over; **previews** (PR, §7 / §14) get their own URL and never touch it — and a failed preview never marks the live agent failed.

### 8.1 Deployment domain & ingress (`*.cencori.app`)

Deployed agents are served from a **separate registrable domain — never `cencori.com`.** They run untrusted user code; sharing an origin with the dashboard would expose `.cencori.com` session cookies to a malicious agent (session theft + XSS/CORS blast radius into the control plane). Use **`cencori.app`** — a Google-run, **HSTS-preloaded** TLD, so every deployment is HTTPS-only, enforced by browsers.

- **Subdomain per agent** — each agent gets its own origin `<hostname>.cencori.app`, so agents can't read/write each other's cookies or storage. Path-based (`cencori.app/<slug>`) is rejected: it shares one origin across all agents.
- **Global uniqueness** — slugs are unique *per project*, but the subdomain namespace is **global**. `hostname = <slug>-<short-id>.cencori.app` (short-id from the agent id), stored on `compute_agents.hostname` with a unique index.
- **Public Suffix List** — submit `cencori.app` to the **PSL** so browsers treat each `*.cencori.app` as a separate site (no supercookies across agents). One-time PR; Vercel did this with `vercel.app`. *Lead-time item — start early.*
- **Wildcard DNS + TLS** — `*.cencori.app` → the ingress/edge; wildcard cert or per-host ACME (Cloudflare / Fly).
- **Ingress** maps `Host: <hostname>.cencori.app` → the agent's `machine_id` → `/invoke` (and `/channels/:c`, signature-verified at the edge).
- **v0 uses `*.fly.dev`** — agents get Fly's free `<app>.fly.dev` URL immediately (app-per-agent), so this whole section is deferred until `cencori.app` is registered. The URL is stored per-deployment (`compute_agent_deployments.hostname`) and on the agent (`compute_agents.hostname`); swapping to `*.cencori.app` is a hostname change.

## 9. Runtime & isolation (v0: wrap a provider)

- **Provider abstraction** (`lib/compute/runtime.ts`) — `RuntimeProvider` (`deploy`/`stop`/`status`). `getRuntimeProvider()` picks by env: **`flyProvider`** (real Fly Machines — app-per-agent, scale-to-zero, `/‌_health` check) when `FLY_API_TOKEN` is set, else **`localProvider`** (mock — completes the deploy loop end-to-end with no infra, for local/preview testing). Setup: `COMPUTE_RUNTIME_SETUP.md`.
- **One machine per agent** (one Fly *app* per agent → its `<app>.fly.dev` URL), scale-to-zero (idle → stopped; inbound → cold start) → idle agents cost ~nothing. Cencori holds the Fly account; the developer never sees it.
- **Isolation:** one container per agent; no shared FS; CPU/mem/time caps; egress allowlist from policy (v1).
- **Lifecycle:** new deployment → active → the agent's live pointer cuts over (**production only**). Previews are side deployments, torn down on PR close. Rollback = redeploy a prior deployment's commit (`sourceDeploymentId`).
- v2 swaps the provider for a first-party isolate runtime (Firecracker/gVisor/Wasm) — same Runtime Contract, nothing above changes.

## 10. What Compute reuses vs. adds

| Capability | Source |
|---|---|
| Repo identity + access | **Reuse** — repo on the agent (`compute_agents.repo_full_name`), access via `organization_github_installations` + `lib/github.ts` |
| Push → redeploy | **Reuse** — GitHub App webhooks (same as Scan's) |
| Import UI (repo-less projects) | **Reuse** — `~/projects/import/github` |
| Turn loop | **Reuse** — Sessions API (already the Arcie path) |
| Models, spend caps, security | **Reuse** — Gateway |
| Agent memory | **Reuse** — Gateway memory (`cencori-store`) |
| Scheduling | **Reuse** — Cron (`app/api/cron/*`) |
| Metering / credits | **Reuse** — `ai_requests` + credits (+ compute-seconds) |
| Guardrails | **Reuse** — Arcie policies (manifest) |
| **Container runtime** | **NEW** |
| **Build pipeline** (clone → adapter → container) | **NEW** |
| **Agent registry + versions** | **NEW** |
| **Ingress** (endpoint + channel webhooks) | **NEW** |
| **Agents/Deploy dashboard tab** | **NEW** |

## 11. Data model (new tables)

> **Naming:** tables are prefixed **`compute_agent_*`** (e.g. `compute_agents`, `compute_agent_deployments`) to avoid the **existing, live `agents` table** — the AI-Agents *config* feature (27 active agents, `/api/v1/agents`, `cencori.agents.*`, gateway `agent-context`). Compute agents are a distinct concept (deployed code). Product-naming of the two is TBD (§15). Migrations (applied): `20260728_130000_compute_agents.sql`, `20260729_120000_compute_agent_hostname.sql`, `20260730_120000_compute_agent_repo.sql` (`repo_full_name`, `repo_id`), `20260730_130000_compute_deployment_commit.sql` (commit metadata), `20260730_140000_compute_deployment_hostname.sql` (per-deployment URL). Routes are project-scoped: `/api/projects/:id/agents` (GET list / POST create), `.../agents/:agentId` (GET detail + deployments), `.../agents/:agentId/deploy` (POST, optional `sourceDeploymentId` = rollback) — not `/v1/agents`. Auto-deploy webhooks: `push` + `pull_request` at `/api/scan/webhook` (the App's single URL) → `lib/compute/webhook.ts`.

```
compute_agents           -- ONE per project (create API returns 409 on a second)
  id, project_id, org_id, slug, name, framework ('arcie'|'langgraph'|…),
  repo_full_name, repo_id,          -- the agent owns its repo (Model B)
  branch, root_dir, hostname, current_deployment_id, status, created_at

compute_agent_deployments   -- the version history; "Deployments" list reads this
  id, agent_id, version, status ('building'|'active'|'failed'|'stopped'),
  commit_sha, machine_id, image_ref, hostname,      -- hostname = this deploy's own URL (previews!)
  environment ('production'|'preview'), source ('push'|'pull_request'|'manual'|'rollback'),
  commit_message, commit_author_name, commit_author_login, commit_author_email,
  commit_author_is_team_member,                     -- populated by the push/PR webhook
  error_message, created_by, created_at, updated_at

agent_secrets            -- encrypted (lib/encryption), injected as env
  id, agent_id, key, encrypted_value

agent_channels           -- from manifest; provider secrets + public path
  id, agent_id, type ('slack'|'discord'|'http'), config jsonb, webhook_secret

agent_schedules          -- from manifest; bound to cron
  id, agent_id, name, cron, last_run_at, next_run_at

agent_invocations        -- metering: compute-seconds, memory, cold starts
  id, agent_id, deployment_id, surface, duration_ms, billed_seconds, session_id, created_at
```

## 12. Security model

- **Untrusted code** → one isolated container per agent; no host access; egress allowlist; CPU/mem/time caps.
- **Scoped creds** — each agent gets a project-scoped `CENCORI_API_KEY` (never org root); provider creds never reach the agent.
- **Secrets** encrypted at rest, injected as env, never logged.
- **Webhook verification** at the platform edge (per-provider signature) before agent code runs.
- **Spend hard-stop** — gateway budgets + Arcie policy budgets pause the agent (`402`) when exhausted.
- **Repo access** — read-only, scoped to the org's existing installation; no new scopes requested.

## 13. Billing

Two meters, one invoice: **token/model usage** (already metered by the gateway) + **compute** (`billed_seconds` × memory tier, `agent_invocations`). Scale-to-zero → idle agents free. Modest margin over provider cost in v0; grows when we own the runtime.

## 14. Phasing

- **v0 — Git-first loop + auto-deploy (built):** `New project ▸ Deploy an agent` (or the **Deployments** tab) → pick repo → **self-building machine** → HTTP `/invoke`. **`git push` → production redeploy; open a PR → preview deploy at its own URL + a PR comment (torn down on close).** Deployments list = version history (commit · author · team · env); detail = one deployment (dense operator surface). Runtime env-gated (Fly / local mock); deploy work is `after()`-wrapped. *Channels/schedules not yet; URLs on `*.fly.dev`.*
- **v0.5 — universal deploy + run lifecycle (built, 2026-07-31):** adapter SDK + registry (10 adapters) with scored, non-executing detection → normalized `AgentBuildPlan`/`AgentManifest`; **container layer** (Dockerfile detect → build path; real Fly builds await the remote builder); the **run lifecycle** (`/runs`, SSE `/events`, `/cancel`, `/resume`) in both Node + Python shims with suspended-run normalization; dashboard **proxy + live run-timeline**. Detail + spec in `COMPUTE_UNIVERSAL_DEPLOY.md`.
- **v1 — channels + schedules + `*.cencori.app`:** webhook gateway (Slack/Discord/HTTP) + cron-bound schedules → the 24/7 agent. Register `cencori.app` (swap off `*.fly.dev`); build caching/snapshots; templates; real preview-app teardown.
- **v2 — CLI + own runtime:** `arcie deploy` as a third source; replace the wrapped provider with a first-party isolate runtime (margin + moat).
- **v3 — multi-framework:** *largely delivered in v0.5* (registry spans Arcie, LangGraph, OpenAI Agents, CrewAI, Mastra, eve, generic Node/Python, Docker, HTTP). Remaining: **publish** the Runtime Contract + adapter guide and **open the ecosystem** to framework maintainers.

## 15. Open decisions

1. ~~**v0 runtime provider**~~ **RESOLVED → Fly Machines**, env-gated. `flyProvider` (real — app-per-agent, scale-to-zero) when `FLY_API_TOKEN` is set, else `localProvider` (mock — loop works with no infra). One prebaked base image self-builds at boot. Setup: `COMPUTE_RUNTIME_SETUP.md`. *(Untested against live Fly until a token is added; the local path is verified.)*
2. **Monorepo root dir** — auto-detect the agent dir vs always ask. (Auto-detect + confirm.)
7. ~~**Preview deploys**~~ **RESOLVED** — PR opened/synchronize/reopened → a **preview** deployment at its own `*.fly.dev` URL + a comment on the PR; **torn down on PR close**. Never touches the production pointer; a failed preview never fails the live agent (`environment='preview'`, `source='pull_request'`). Delivered via the GitHub App's `push` + `pull_request` webhooks (same endpoint as Scan), Vercel-safe via `after()`.
3. ~~**Repo-less projects / repo-per-agent**~~ **RESOLVED → Model B.** **One agent per project**, 1:1 — the project *is* the agent; the agent owns its repo (`compute_agents.repo_full_name`). "Deployments" = that agent's version history (the Vercel model). Chosen over "many agents per project" because it's simpler, matches the telemetry-binding goal, and matches how a Cencori project (keys/budget/memory/governance) is already scoped. Deploying is a **project-creation** path (`New project ▸ Deploy an agent`, `deployAgentProject` — project + agent + deploy v1 atomically); a project can also stay **agent-less** (gateway/SDK only). The create API enforces one-per-project (`409 agent_exists`). The agent takes the project's name (no separate agent-name field). *(Superseded the earlier "connect-a-repo-to-the-project" idea — the repo lives on the agent now; `POST /api/projects/:id/repo` is unused.)*
4. **Deploy domain** — RESOLVED (§8.1): subdomain-per-agent on **`*.cencori.app`** (`<slug>-<short-id>.cencori.app`), separate registrable domain for origin isolation. Bring-your-own custom domain later.
5. **Cold-start budget** — acceptable first-request latency for scale-to-zero, or warm pool for paid tiers.
6. **Base-path bug to fix first** — Arcie runner uses `cencori.com/api/v1`, docs say `cencori.com/v1`; pin the canonical base before the build injects `CENCORI_API_URL`.

## 16. Workstreams (who builds what)

Two mostly-independent tracks. The **Cencori Compute** track is the main focus; the **Arcie** track is self-contained (own repo `/Users/apple/arcie`) and can run in parallel / be delegated to another coding agent.

### Track A — Cencori Compute (platform) — *this focus*
- `POST /v1/agents` + `agent_deployments` (deploy API + registry, data model §11).
- Build pipeline: clone via `getInstallationOctokit` → adapter → containerize (§8).
- Runtime provider integration (Fly Machines, §9) — boot/health/cutover/scale-to-zero.
- Ingress: `<hostname>.cencori.app` → `/invoke` (subdomain-per-agent, §8.1; wildcard DNS/TLS + PSL); (v1) channel webhook gateway.
- Scheduler binding to cron (v1).
- Dashboard **Agents/Deploy** tab (§7) + dashboard test chat (embeds Arcie's `<agent-chat>`).
- Metering (`agent_invocations`, compute-seconds) + billing (§13).

### Track B — Arcie (framework) — *parallelizable / delegate*
- ✅ **`<agent-chat>` web component** — shipped as `arcie/web`; `web-chat` Next.js template retired; `arcie dev` serves it (§4.1). *(done)*
- ✅ **Adapter / contract server** (`arcie serve`, 5 RC routes) + ✅ **`arcie build` → `.arcie/server.mjs`** deployable artifact. *(done)*
- ✅ **Fixes** — base-path pinned to `/api/v1`; "Zett" refs (none existed). *(done)*
- ⬜ **The Arcie UI standard** (the bigger effort): a full-stack, learnable UI framework — component kit + hooks (`useAgent`/`useInvoke`/`useSession`/`useMemory`) + directory conventions + theming, compiled to **static** by `arcie build`. Plus a **"How to build with Arcie"** doc. Arcie is its own framework (§4.1) — not "bring your own." Needs its own design doc.
- ⬜ **`arcie build` → static frontend output** — extend build to compile the Arcie UI to static assets (Track A's pipeline serves them on the subdomain).

**Interface between tracks:** the **Runtime Contract (§4)** + the **manifest** + the **`<agent-chat>` web component**. As long as both sides honor those, they build independently.
