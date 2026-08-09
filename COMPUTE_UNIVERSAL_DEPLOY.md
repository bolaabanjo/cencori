# Cencori Universal Agent Deploy — Adapter Architecture

> **Status:** v0.2 — **partly shipped.** Started 2026-07-30. Supersedes the "one Arcie adapter" framing in `COMPUTE_ARCHITECTURE.md` §14/v3.
>
> **Shipped (2026-07-31):** the adapter SDK + registry (10 adapters), the **container layer** (Dockerfile builds → run, detection + build path), and the **run lifecycle** (`/runs`, `/runs/:id`, SSE `/events`, `/cancel`, `/resume`) in **both** shims (Node + Python), with suspended-run normalization (LangGraph interrupt = OpenAI approval = Arcie approval). Dashboard **proxy + live run-timeline** wired. See §4, §8. Remaining: Fly remote-builder for real Docker/base-image builds, native-adapter breadth, open ecosystem.
> **North star:** *If a repository contains a runnable agent, Cencori can detect it, understand it, and deploy it.*

Not "support Arcie + a few integrations." Universal support. You cannot hand-code deployment logic for every framework — universality comes from **compatibility layers + a public contract + versioned adapters**, not `if` statements.

This is what makes Cencori ≠ a Vercel clone: Vercel detects how to *start a process*; Cencori detects the agent's **topology and runtime semantics** — its runs, tools, sessions, memory, approvals, schedules, and failures — and translates them into one operational system.

---

## 1. Compatibility model — five layers (never "unsupported")

Deployment is possible through the highest layer that matches. We never say *"unsupported framework"* while a lower layer can still ship it.

1. **Native adapters** — deep, zero-config support for major frameworks. Understand tools, memory, agents, graphs, streaming, checkpoints, config. Best dashboard experience.
2. **Language adapters** — generic Python / Node / Go / Rust. User supplies or confirms an entry point; Cencori wraps it with the runtime contract.
3. **Existing HTTP agents** — the repo already runs a server → detect its port, start command, health route, invocation route → proxy it through Cencori ingress.
4. **Container support** — an existing `Dockerfile` / OCI image → run as-is. **Essential to "every framework."**
5. **Custom Runtime Contract** — the final escape hatch. Any framework, including a private internal one, works if it implements the protocol.

> Layers 2–5 mean you can honestly say **"deploy any agent"** *before* every framework has a first-class adapter. Native adapters then improve detection + observability — they don't determine whether deploy is *possible*.

---

## 2. Detection is a product, not a collection of `if`s

The detection engine **scans without executing untrusted repository code** (parse `package.json` / `pyproject.toml` / `requirements.txt` / `go.mod`; light import/AST evidence; file heuristics — never run it) and produces a **scored deployment plan**:

```text
Repository
  → workspace / root detection
  → language + package manager
  → framework evidence
  → entry point
  → build / start commands
  → agent topology
  → capabilities
  → required secrets
  → deployment plan (+ confidence)
```

Example result the user reviews (and corrects):

```text
Detected agent
  Framework        LangGraph 0.x
  Language         Python 3.12
  Package manager  uv
  Entry point      src/support/graph.py:graph
  Interface        Streaming + persistent sessions
  Capabilities     8 tools · 2 sub-agents · checkpoints
  Required env     OPENAI_API_KEY · DATABASE_URL
  Confidence       0.94  ·  Fully supported (native adapter)
```

**There is no framework dropdown before detection.** The user confirms or corrects the *plan*; framework is an override *within* the review, not an upfront choice.

---

## 3. Normalize every framework into one internal model

Each adapter emits a normalized **build plan** — the dashboard and pipeline speak this, never per-framework internals:

```ts
interface AgentBuildPlan {
  adapter: string;            // "@cencori/adapter-langgraph"
  adapterVersion: string;
  language: string;           // "python" | "node" | "go" | ...
  framework?: string;         // "langgraph"
  frameworkVersion?: string;
  rootDirectory: string;
  packageManager?: string;    // "uv" | "pnpm" | "pip" | ...
  installCommand: string;
  buildCommand?: string;
  startCommand: string;       // what the container runs
  entrypoint?: string;        // "src/support/graph.py:graph"
  runtime: RuntimeSpec;       // base image, node/python version, port, health
  manifest: AgentManifest;
  confidence: number;         // 0..1
  compatibility: 'native' | 'language' | 'http' | 'container' | 'contract';
  warnings?: string[];        // e.g. "missing DATABASE_URL", "no health route"
}
```

The normalized **manifest** describes what the agent *is*:

```ts
interface AgentManifest {
  agents: AgentNode[];        // + sub-agents / topology
  tools: ToolSpec[];
  models: ModelRef[];         // ideally routed via the Cencori gateway
  memory?: MemorySpec;        // checkpointing / persistence
  io?: { input?: JSONSchema; output?: JSONSchema };
  streaming: boolean;
  humanApprovals: boolean;    // suspended-run semantics
  channels: ChannelSpec[];    // slack / discord / http
  schedules: ScheduleSpec[];  // cron
  requiredSecrets: string[];
  network?: { egressAllow?: string[] };
  session: 'stateless' | 'persistent';
  frameworkMeta?: Record<string, unknown>;
}
```

---

## 4. The Runtime Contract expands (runs, not just chat) — **shipped**

Universal agents need a **run lifecycle** — start, stream, inspect, cancel, and **resume/approve a suspended run**. Both shims (`compute/runtime/cencori-shim.mjs`, `compute/runtime/python/cencori_shim.py`) serve it today; the dashboard reaches it through the same-origin proxy (`/api/projects/:pid/agents/:aid/runs/*`) and renders it in `components/compute/RunTimeline.tsx`:

```text
POST   /runs                 start a run            → { runId }
GET    /runs/:id             status
GET    /runs/:id/events      stream events (SSE / NDJSON)
POST   /runs/:id/cancel      cancel
POST   /runs/:id/resume      resume / approve a suspended run
POST   /channels/:name       channel handler (verified webhook)
POST   /schedules/:name      scheduled trigger
GET    /_manifest            capabilities (the normalized manifest)
GET    /_health              health / readiness
                             (+ graceful shutdown on SIGTERM)
```

Events are **normalized** into one vocabulary so the platform renders a single timeline across every framework: `run.started · message · run.suspended · run.output · run.failed · run.completed` (each with a monotonic `seq` for SSE reconnect via `?after=` / `Last-Event-ID`). The adapter's **runtime shim** translates between this and each framework's native concepts — a **LangGraph interrupt**, an **OpenAI Agents SDK handoff/approval**, and an **Arcie approval** differ internally but all surface as `run.suspended` (resumable via `/resume`; LangGraph resumes with a `Command`). Framework-aware streaming is wired: OpenAI Agents (`run(…, {stream})` / `Runner.run_streamed`), LangGraph/LangChain/Mastra (`.stream()`/`.astream()`), generic fallback to a single-output run.

**Backward-compat:** `POST /invoke` stays as **sync sugar** (runs to completion, returns `{output}`), so today's Arcie server + `<agent-chat>` widget keep working alongside the run lifecycle.

---

## 5. Adapter registry — versioned packages, not pipeline logic

Adapters are **packages**, not branches in the deploy API:

```text
@cencori/adapter-arcie            @cencori/adapter-generic-python
@cencori/adapter-langgraph        @cencori/adapter-generic-node
@cencori/adapter-openai-agents    @cencori/adapter-http      (existing server)
@cencori/adapter-crewai           @cencori/adapter-docker    (Dockerfile / OCI)
@cencori/adapter-mastra           @cencori/adapter-vercel-ai
@cencori/adapter-vercel-eve       @cencori/adapter-autogen
```

Each adapter owns two halves:

- **Build-time (runs in the deploy pipeline, Node):** detection rules · supported versions · build-plan generation · manifest extraction · diagnostics.
- **Runtime (runs in the container):** the **shim** (FastAPI/Starlette for Python, Express/Node for Node) that imports the user's agent and serves the contract · event normalization.

The registry can eventually be **public** so framework maintainers ship their own official adapter.

---

## 6. Native adapter targets (the landscape)

| Ecosystem | Frameworks |
|---|---|
| **Python** | LangGraph · CrewAI · OpenAI Agents SDK · Pydantic AI · Microsoft Agent Framework (AutoGen + Semantic Kernel) · Google ADK · LlamaIndex · Agno · smolagents · Strands (AWS) · Letta · Griptape · Haystack |
| **JS / TS** | **Arcie (reference)** · Vercel AI SDK · **Vercel eve** · Mastra · LangGraph.js · OpenAI Agents SDK (TS) · LlamaIndex.TS · Cloudflare Agents · Inngest AgentKit |
| **Generic** | generic-python · generic-node · http (existing server) · docker |
| **No-code / visual** (later) | n8n · Flowise · Langflow · Dify |

**Tier 1 (build first, by adoption):** Arcie ✅ → LangGraph → OpenAI Agents SDK → CrewAI (Python); Vercel AI SDK → Mastra → **eve** (JS); plus **generic-python / generic-node / http / docker** — those four are what make "any agent" true on day one.

> **Vercel eve** — Vercel's newest agent framework — is a Tier-1 JS native target. Until its native adapter ships it deploys via **generic-node** or **http**, like anything else. *(Adapter authors: capture eve's run/handoff semantics into the normalized manifest.)*

---

## 7. Frontend flow (detection-first)

1. Select repository
2. **"Analyzing agent"** (detection engine)
3. **Review detected architecture** (framework · entry point · capabilities · required secrets · confidence)
4. Resolve secrets + compatibility warnings
5. Deploy
6. **Automated smoke test** (one `/runs` against the booted machine)
7. Test it yourself
8. Inspect the resulting trace

Compatibility is shown **agent-natively**, never a bare "unsupported":

- ✅ **Fully supported** (native adapter)
- 🟦 **Compatible through Python adapter**
- 🟦 **Compatible through Docker**
- ⚠️ **Needs an entry point** (confirm one)
- 🟩 **Runtime contract detected** (already speaks Cencori)
- ⛔ **Unsupported runtime requirement** (the only true "no")

---

## 8. Rollout order

1. ✅ **Expanded Cencori Agent Runtime Contract** — §4, live in both shims (run lifecycle + normalized events + suspend/resume).
2. ✅ **Adapter SDK + normalized manifest** (`AgentBuildPlan` / `AgentManifest` + `defineAdapter()`; registry of 10 adapters).
3. ✅ **Arcie on the adapter SDK** (reference implementation).
4. ✅ **Generic Node + Python adapters** (entry-point wrap through the shims; JS native adapters route through the Node shim too).
5. ✅ **Docker + existing-HTTP support** — container layer (Dockerfile detect → build path) + http adapter. *(Real Docker/base-image builds on Fly await the remote builder — `flyBuildFromDockerfile` boundary; local/mock runs the whole loop.)*
6. ⏳ **Framework detectors + native adapters** — continuous (LangGraph, OpenAI Agents, CrewAI, Mastra, eve shipped as best-effort; harden against real repos).
7. ⏳ **Open the adapter ecosystem** to framework maintainers.

---

## 9. Reconciliation with what's already built

- **Contract:** today's 5 routes are a subset of §4. `POST /invoke` stays as sync sugar over `POST /runs`.
- **Framework dropdown → post-detection.** The upfront `Select` in `deployments/page.tsx` + `~/projects/new-agent` is replaced by **detect → review plan → (optional) override**. `compute_agents.framework` becomes *detected*, not chosen.
- **Base image:** today Node-only, hardcoded `arcie build`. Becomes **per-language base images** (Node, Python) whose entrypoint runs the **build plan's `installCommand` / `startCommand`** (from the adapter) instead of a fixed command.
- **Storage:** persist the full `AgentBuildPlan` + `AgentManifest` on the deployment (jsonb) so the dashboard renders topology/capabilities without re-detecting.
- **Adapters live** in a `packages/adapters/*` workspace (extractable to a public monorepo later).

## 10. Open decisions

1. **Contract shape** — keep `/invoke` as sync sugar over `/runs` (rec: yes) vs runs-only.
2. **Adapter home** — a `packages/` workspace inside cencori now, or a separate repo (rec: workspace now).
3. **Detection depth v1** — manifests + imports only, or add a light per-language AST pass for entry-point discovery (rec: manifests + imports first; AST for native adapters).
4. **Two runtimes** — ship the Python base image alongside Node in step 4/5 (needed for LangGraph/CrewAI/etc.).
