# Cencori Memory — API + Product Roadmap

> Draft. Written 2026-07-09. Iterating live with Bola.

Memory is not a separate Cencori product. It is a property of a request. Every
chat, vision, document, and agent call already goes through the gateway — the
gateway is the natural place for the memory layer to live. This document is
the sketch of what that looks like, from the API surface up to the React
components and out to the roadmap phases.

---

## Positioning

**One-liner:** *The memory layer of the AI cloud.*

**Elevator:** Every request through Cencori can remember the user it was for.
Turn it on with a flag, off with a flag. No separate account, no separate
SDK, no bolted-on API. Encrypted, region-aware, PII-redacted, audit-logged
— because it goes through the same pipeline every other Cencori request does.

**Why it's not Supermemory / Mem0 / Zep:** Those companies sell memory as a
product you bolt onto OpenAI. Cencori memory *is* the request. That's the
moat. Composition with BYOK, regional routing, PII redaction, audit logs,
and spend caps is free — because we already have them.

---

## Shape decisions

1. **Memory is a gateway feature, not a product.** No `memory.cencori.com`
   subdomain. No separate SDK. `cencori.memory.*` and a `memory` field on any
   existing request.
2. **Every memory is scoped.** Never a global bag. Scopes: `session`, `user`,
   `workspace`, `org`. A memory is always addressable by `(orgId, scope, key)`.
3. **Retrieval and writeback are independent flags.** You can inject memories
   without writing, write without injecting, or do both (the default).
4. **PII redaction runs before writeback.** The redacted / tokenized value is
   what gets stored — not the raw one. Raw values never persist.
5. **Region-pinned by default.** A memory written from an EU project stays in
   EU storage. Residency is enforced at write, not at query.
6. **Forget is a first-class operation.** Not a soft delete. Not an
   annotation. An actual removal, cryptographically confirmed, in the audit
   log.
7. **BYOK-compatible.** Embeddings for memory use whichever embedding model
   the project is configured for — including the customer's own key.

---

## API surface — HTTP

### Chat completions (extended)

```http
POST /v1/chat/completions
{
    "model": "gpt-4o",
    "messages": [
        { "role": "user", "content": "What did we agree about pricing?" }
    ],
    "memory": {
        "userId": "user_abc123",
        "scope": "user",
        "retrieve": true,
        "write": true,
        "topK": 5,
        "threshold": 0.7,
        "namespace": "pricing-discussions"
    }
}
```

Default behavior when `memory` is present:
- `retrieve: true` — pull top-K relevant memories, inject as a system message
  block ahead of the user's turn
- `write: true` — after the response, extract facts from the exchange and
  persist them for future recall
- `topK: 5`, `threshold: 0.7` — sensible defaults

Response includes:
```json
{
    "choices": [ ... ],
    "memory": {
        "retrieved": [{ "id": "mem_xxx", "score": 0.82, "content": "..." }],
        "written": [{ "id": "mem_yyy", "content": "..." }],
        "region": "us-east-1"
    }
}
```

### Direct memory endpoints

```http
POST   /v1/memory/write           # single write
POST   /v1/memory/write/batch     # bulk write
POST   /v1/memory/search          # semantic search
POST   /v1/memory/forget          # forget by filter
DELETE /v1/memory/:id             # forget by id
GET    /v1/memory/list            # paginate
GET    /v1/memory/:id             # single lookup
POST   /v1/memory/export          # user-facing GDPR export
```

Example write:
```http
POST /v1/memory/write
{
    "userId": "user_abc123",
    "scope": "user",
    "content": "Prefers dark mode. Uses TypeScript primarily.",
    "namespace": "preferences",
    "metadata": { "extractedFrom": "settings-page" }
}
```

Example forget:
```http
POST /v1/memory/forget
{
    "userId": "user_abc123",
    "filter": {
        "scope": "session",
        "before": "2026-01-01T00:00:00Z"
    }
}
```

---

## API surface — TypeScript SDK

```ts
import { Cencori } from '@cencori/sdk';
const cencori = new Cencori({ apiKey: process.env.CENCORI_API_KEY });

// The magic path — one line makes chat stateful.
const response = await cencori.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'What did we agree about pricing?' }],
    memory: { userId: session.user.id },
});

// Direct memory ops
await cencori.memory.write({
    userId: session.user.id,
    content: 'Prefers dark mode',
});

const memories = await cencori.memory.search({
    userId: session.user.id,
    query: 'ui preferences',
    topK: 3,
});

await cencori.memory.forget({
    userId: session.user.id,
    filter: { scope: 'session' },
});

// GDPR export — hand to the user
const dump = await cencori.memory.export({ userId: session.user.id });
```

---

## React surface — `@cencori/react`

Three shapes, in order of ceremony:

### 1. Inline prop — the two-line integration

```tsx
import { Chat } from '@cencori/react';

<Chat
    model="gpt-4o"
    apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY!}
    memory={{ userId: session.user.id }}
/>
```

### 2. Provider — sets memory context once, all children get it

```tsx
import { MemoryProvider, Chat, VoiceCall } from '@cencori/react';

<MemoryProvider userId={session.user.id} scope="user">
    <Chat model="gpt-4o" />
    <VoiceCall model="realtime-1" />
</MemoryProvider>
```

Every AI surface underneath the provider shares the same memory context. A
voice call fills in facts learned in a chat. A vision analysis references
what the user uploaded yesterday.

### 3. Hook — custom UI needs custom memory

```tsx
import { useMemory } from '@cencori/react';

function ProfilePage() {
    const { memories, write, forget, search, exportAll } = useMemory({
        userId: session.user.id,
    });

    return (
        <>
            <h2>What we remember about you</h2>
            {memories.map((m) => (
                <MemoryRow key={m.id} memory={m} onForget={() => forget(m.id)} />
            ))}
            <button onClick={exportAll}>Download my data</button>
        </>
    );
}
```

Plus a drop-in `<MemoryInspector>` component — a user-facing "here's what the
model remembers about you" panel. Renders memories, groups by namespace,
lets the user delete individual entries. Enterprise app teams get GDPR
right-to-be-forgotten UX out of the box.

---

## Data model

```ts
type Memory = {
    id: string;                 // mem_<uuid>
    organizationId: string;     // hard boundary
    projectId: string;          // soft boundary
    scope: 'session' | 'user' | 'workspace' | 'org';
    scopeKey: string;           // userId for scope=user, sessionId for scope=session, etc.
    namespace?: string;         // optional sub-scope inside scope

    content: string;            // the fact / summary — post-redaction
    embedding: number[];        // pgvector

    metadata: {
        extractedFrom: 'chat' | 'document' | 'manual' | 'agent';
        modelUsed?: string;
        sourceRequestId?: string;
        piiRedactions?: number;
        [key: string]: unknown;
    };

    region: 'us-east-1' | 'eu-west-1' | 'af-south-1' | ...;
    createdAt: string;
    updatedAt: string;
    lastAccessedAt: string;
    accessCount: number;

    // Temporal / decay
    importance: number;         // 0–1, decays over time unless reinforced
    expiresAt?: string;
};
```

Storage:
- Session scope — Redis. Short TTL. Cleared on session end.
- User / workspace / org scope — Postgres + pgvector, region-pinned.

---

## Governance — how memory doesn't become the incident

1. **PII redaction runs before writeback.** The gateway's existing PII
   pipeline runs on any string headed for memory storage. Raw SSN → token,
   raw name → placeholder, etc.
2. **Hard boundary at `organizationId`.** Under no code path can a memory
   written by org A be read by org B. Enforced at the query layer, tested
   with property tests.
3. **Every read and write goes to the audit log.** Same immutable audit log
   that the rest of the gateway uses. Compliance teams can trace who's
   remembering what.
4. **Region enforcement at write.** A project pinned to `eu-west-1` can only
   write memories to EU storage. Query cannot pull across regions unless the
   project is configured multi-region.
5. **GDPR export + hard-forget are first-class.** `POST /v1/memory/export`
   and `POST /v1/memory/forget` are contract-level APIs. Forget removes the
   row and every embedding replica, and emits a cryptographically-signed
   receipt.
6. **Per-project opt-in.** Memory is off by default. Turning it on for a
   project requires a project admin. The admin sees a big obvious "this app
   will remember users" banner.

---

## Phases

### Phase 1 — Conversation memory (weeks 1–2)

Ship the wedge. Small, complete, useful.

- `memory` field on `POST /v1/chat/completions`
- `POST /v1/memory/write` and `POST /v1/memory/search` direct APIs
- Session scope (Redis) + user scope (Postgres+pgvector)
- Fact extraction from chat exchanges — simple LLM call ("what should we
  remember from this exchange?")
- TS SDK: `cencori.memory.*` + `memory` param on chat
- React SDK: `<Chat memory={...} />` prop + `useMemory` hook
- Dashboard: per-project memory toggle, count of memories per user
- PII redaction pre-write. Audit log integration.
- Docs page. One example app (chatbot that remembers).

**Ship criteria:** working demo where a chat app remembers user preferences
across sessions in three lines of React.

### Phase 2 — Multi-modal memory (weeks 3–4)

Files, images, and documents become memorable too.

- Documents API results can auto-write to memory
- Vision API results can auto-write to memory
- `<MemoryProvider>` React context for cross-surface memory
- Python + Go SDK parity
- Workspace + org scopes
- `<MemoryInspector>` React component (GDPR-ready UI)
- Region pinning enforced end-to-end

**Ship criteria:** upload a PDF, ask a question about it in a chat six weeks
later, the model still knows.

### Phase 3 — Entity graphs & temporal reasoning (weeks 5–7)

The hard problems Supermemory has spent a year on.

- Entity extraction and merging — the memory layer knows "John from Zap"
  and "John Smith @ Zap Corp" are the same person
- Temporal reasoning — recent memories weighted higher, contradictions
  resolved in favor of the newer fact
- Importance decay — unused memories fade unless reinforced
- Forget with filters — `forget everything about my former employer`
- Dashboard: memory graph explorer per user

**Ship criteria:** memory that survives a year of use without becoming a
tangled contradiction.

### Phase 4 — Ongoing

- Cross-workflow memory — an agent chain can share memory with a chat
  surface
- Fine-tuning integration — memories can become training signal for
  Cencori Compute fine-tunes
- Advanced dedup, semantic clustering
- Memory analytics for enterprise (what does the model know about our
  users, aggregated)

---

## Success criteria

- Working AI app with memory in **three lines of React**.
- Latency budget: **<150ms retrieval overhead** on a chat request at p95.
- **Zero cross-org memory leaks** — property-tested, contract-level.
- **BYOK-compatible** on day one.
- Forget request → audit-verifiable removal in **<60 seconds**.

---

## Pricing — the fill gauge (locked in 2026-07-09)

Every project sees a single fill gauge in the dashboard — *"you're at 47% of
your Pro memory tier."* The 100% mark is a real ceiling. When your product
uses memory for more end-users, the gauge fills faster. Free tiers fill
quickly by design — that's the upgrade signal.

This shape matches Vercel bandwidth, Supabase storage, Cloudflare requests.
Devs already know how to react when the bar climbs. It also hides the
underlying metric so we can evolve it (memories → storage bytes → composite)
without breaking anyone's mental model.

### Tiers (v1)

**Free · Developer**
- 1,000 memories per project — the starter tank
- 50 end-users tracked (soft cap, informational)
- 30-day retention on `session` scope, 90-day on `user` scope
- `session` + `user` scopes only
- No MCP bridge
- No region pinning (default region only)

**Pro · $TBD/mo (target range $29–$49)**
- 100,000 memories per project — the product tank
- Unlimited end-users
- 1-year retention, configurable
- All scopes (`session` / `user` / `workspace` / `org`)
- MCP bridge — Cencori memory readable from Claude Desktop, Cursor, any MCP
  client
- Region pinning: US / EU baseline

**Enterprise · contract**
- Unlimited memories
- Configurable retention up to 7 years
- All regions + custom regions
- Private tenants
- Custom SLA + named support

### Metering unit

Meter by **count of memories**, each with a **10KB soft cap on content**.
Consumer-legible, easy to communicate, prevents abuse (a single memory can't
be a 5MB blob). Under the hood we can evolve to a composite (memories +
storage + retrieval calls) without customers noticing.

### Fill-gauge behavior

- **80% — nudge.** Non-blocking dashboard banner + email to the project owner.
  "You're at 80% of your Pro memory tier — consider upgrading before writes
  start failing."
- **100% — hard block on writes.** `429 memory_quota_exceeded` with a clear
  upgrade URL in the error payload:
  ```json
  {
      "error": {
          "code": "memory_quota_exceeded",
          "message": "Project has reached its memory tier limit.",
          "upgradeUrl": "https://cencori.com/pricing?upgrade=memory&project=proj_xxx",
          "tier": "free",
          "used": 1000,
          "limit": 1000
      }
  }
  ```
- **Reads still work at 100%.** Existing memories continue to serve
  retrievals — the product does not silently forget its users. Only new
  writes are blocked.
- No grace period. Clean edge at 100%. Devs get 20% of runway from the 80%
  nudge; that's the grace.

### The wedge case study — code-gen apps (Cursor-shaped products)

A code-gen or IDE-assist app is the Pro sweet spot. Every end-user has a
rolling context of what they're building, their preferences, their prior
sessions, their design patterns. Cencori memory tracks that; the app doesn't
build the vector store.

- Free tier gets them to a working demo.
- Pro tier gets them to production (~10k active devs).
- 100k+ active memories → enterprise conversation, private tenant, regional
  pinning if needed.

---

## MCP bridge — Phase 2 (locked in 2026-07-09)

Cencori memory becomes readable from any MCP client — Claude Desktop, Cursor,
Continue, any MCP-native tool. Effect: every dev who uses those tools has a
reason to write to Cencori, because it's the memory that follows them into
their editor.

Shape:
- `mcp.cencori.com` MCP server endpoint
- Auth via Cencori API key
- Exposes `memory.search`, `memory.list`, `memory.write` as MCP tools
- Read-scoped by default (safer). Write scope requires explicit grant.
- Per-project MCP tokens with read/write flags

---

## Fact extraction — customizable from v1 (locked in 2026-07-09)

The "what should we remember from this exchange?" LLM call is exposed as a
first-class customizable step, not an opaque internal.

### Project-level default

Configured in the dashboard per project:

```ts
{
    extractionModel: "gpt-4o-mini",       // which model does extraction
    extractionPrompt: "Extract facts about the user's preferences and current work. Be concise.",
    minImportance: 0.5,                     // don't store trivia below this
    maxMemoriesPerExchange: 5,
    enabled: true
}
```

### Per-request override

Any chat request can override the project default:

```ts
await cencori.chat.completions.create({
    model: 'gpt-4o',
    messages,
    memory: {
        userId,
        extract: {
            model: 'claude-haiku-4-5',
            prompt: 'Extract only facts about the code being written. Skip small talk.',
            minImportance: 0.7,
        }
    }
});
```

### Full custom handler (advanced)

For teams that need total control — pass a handler; we call it with the
completed exchange, use whatever it returns:

```ts
await cencori.chat.completions.create({
    model: 'gpt-4o',
    messages,
    memory: {
        userId,
        extract: {
            handler: async (exchange) => {
                // Your logic, your model, your rules.
                return [
                    { content: '...', importance: 0.9, metadata: {} }
                ];
            }
        }
    }
});
```

Rationale for exposing this on day one: the code-gen wedge case study has
opinionated extraction needs (facts about the codebase, framework choices,
naming conventions) that a generic prompt would miss. Making extraction
tunable turns Cencori memory into a memory *platform*, not just a hosted
service — teams can build genuinely differentiated experiences on top.

---

## React `<MemoryInspector>` — both surfaces (locked in 2026-07-09)

Ship two exports from `@cencori/react`:

1. **`<MemoryInspector>`** — themed default. Drop it in, works out of the
   box, matches the Cencori design system. For dashboards and simple
   settings pages.
2. **`<HeadlessMemoryInspector>`** — headless component using the render-
   props pattern. Consumers style every element themselves. Ships alongside
   an official `@cencori/react/shadcn` themed default that's a thin wrapper
   over the headless one, tokenized for shadcn/ui.

Same shape as Radix + shadcn: primitive → themed default. Devs pick their
ceremony level.

---

## Cross-session continuity — the marketing hook (locked in 2026-07-09)

The single most under-solved UX problem in AI products today: hit context
limit → open new chat → lose everything → re-paste project context like a
caveman. Every user has hit it. Almost nobody ships infrastructure for it.

Cencori's design solves it as a natural consequence of scoping:

- `session` scope: what we've said in THIS chat window. Redis-backed.
  Cleared on session end. Ephemeral stuff — "please be concise," small talk.
- `user` scope: everything material we've ever established about this user.
  Persistent, region-pinned. Survives new-chat, new-device, new-session.

**A new chat is not a memory reset. It is a fresh conversation with a
model that already knows the user.**

### The namespace escape hatch — multi-project users

A single user can have multiple projects, and memories should not bleed.
The `namespace` field partitions user-scope memories:

```ts
memory: { userId: 'sarah_e1f2', namespace: 'proj_ledgerkit' }
memory: { userId: 'sarah_e1f2', namespace: 'proj_personal-site' }
```

Retrieval strategy:
1. Top-K from `(userId, namespace='proj_ledgerkit')` — project-specific
2. Top-M from `(userId, namespace=null)` — cross-project user facts
   (framework preferences, style, tools — should carry everywhere)
3. Merge, re-rank by relevance, inject

Consumer apps get sidebar organization for free — each "project" the user
creates maps to a namespace. Cencori routes.

### Session promotion — the elegant last mile

At end of session, an async promotion pass identifies important session-
scope memories and promotes them to user scope. Trivia decays in Redis;
material stuff sticks around across sessions. Threshold is configurable
via the extraction step's `minImportance`.

This is what makes memory feel magical rather than noisy.

### Marketing hook

*"Never lose context again."*

Or: *"Your users don't have to re-explain themselves. Ever."*

Or (dev-facing): *"Cross-session context, out of the box. No chat sidebar
gymnastics."*

This should be the primary hero for the memory product landing page.

---

## The nesting story — Cencori's compounding wedge

The case study intentionally has two layers:

- **CodeCraft** — an AI product built on Cencori. Uses Cencori for LLM
  inference + memory. Sarah is CodeCraft's end-user.
- **Ledgerkit** — what Sarah is building *inside* CodeCraft. A bookkeeping
  app. Not itself an AI product in v1. Not on Cencori.

The compounding case: if Sarah adds an AI feature to Ledgerkit
("summarize this month's expenses"), CodeCraft can scaffold Cencori into
Ledgerkit for her. Now Ledgerkit is *also* on Cencori. Two levels of
nesting.

This is a genuinely powerful marketable story: **CodeCraft uses Cencori
to build itself, and every AI product shipped from CodeCraft uses Cencori
too.** Cencori becomes the AI backbone at every layer of the stack.

Sales angle: partner with dev-tool companies. If your product helps devs
ship AI features, you have every reason to ship Cencori as the default
under those features. Distribution moment number two, after MCP.

---

## Remaining open questions

1. **Pro price point** — $29 or $49? Needs a rough cost model (pgvector
   storage, embedding calls, retrieval compute per active memory). Not
   blocking on API work — deferred.

---

## Not doing

- No standalone `memory.cencori.com` product surface.
- No separate SDK. Memory ships in `@cencori/sdk` and `@cencori/react`.
- No unbounded storage — memories have caps per project and per user, with
  eviction policy configurable.
- No "memory across customer apps" — memories never leave the org boundary
  they were written in, ever, period.
