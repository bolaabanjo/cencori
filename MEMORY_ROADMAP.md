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

## 2026-07-18 update — Managed-only + the recall thesis

Two decisions supersede parts of the original sketch below. Everything already
shipped (Phase 1 — see status at the bottom) stays; this is direction, not a
rewrite.

### Decision 1 — Memory is MANAGED. Not BYOK.

Cencori's own Gemini key runs memory. Cencori pays Google; the user pays
Cencori (provider cost + markup, already computed via `cencoriChargeUsd`).
There is **no BYOK path for memory** (this supersedes Shape-decision #7 below,
which described BYOK embeddings). Rationale (Bola): *"I want memory to be on
us."*

Consequence: **the managed backend IS the product.** Every user shares
Cencori's Gemini key and its quota, so provider capacity is no longer a
detail — it is existential. Supermemory/Mem0 make the developer stand up and
run a store; we take that entire burden. That only wins if it is *actually
reliable at scale*. Reliability is not the tax on this bet — it is the moat.

### Decision 2 — The recall thesis (why the gateway seat wins)

A standalone memory API sees a keyhole: only what the developer remembered to
send it (a query, some `add()` calls). It is blind to the real prompt, the
system message, the model being called, and it **never sees the completion**.

Sitting between the app and the model, Cencori sees the **whole request in
flight, the response coming back, and which model it's for** — a strictly
larger information set than any out-of-band memory service can have. Their
recall ceiling is capped by the keyhole; ours is not. For recall specifically
this cashes out four ways:

1. **Retrieve against real intent, in context** — we search against the actual
   model-bound prompt, not a hand-written query. Better query in → better recall.
2. **Capture is automatic and complete** — extract from every opted-in turn; we
   can't recall what a dev forgot to save, and we're saving everything worth saving.
3. **We control the injection point** — optimal position + format for the specific model.
4. **We can close the loop** — learn from the completion; refine importance from outcomes.

The seat raises the ceiling; it does not auto-win. Recall quality is still
engineering (extraction, dedup, contradiction handling, ranking, thresholds).
Taxes the seat imposes and we must respect: **latency** (we're in the hot path,
<150ms p95 budget on every request) and **noise/cost** (auto-capture on a shared
Gemini key — ruthless importance filtering or recall gets *worse*).

### Decision 3 — Standalone-as-product + the unification principle

Memory is **one product with two entry points**, and standalone gets a public
product face without becoming a separate thing:

- **Native (toggle):** add a `memory` field to any Cencori request. Better recall
  (the seat — Decision 2).
- **Standalone (drop-in):** call `cencori.memory.*` / `/v1/memory/*` directly with
  only a Cencori key. Bring any provider/stack. This is the Mem0/Supermemory-shaped
  front door — a Mem0 user lands here without ever needing to understand the gateway.

**The unification principle (the line we do not cross):** *one client, one key,
one store, one directive shape — two entry points.* Hold all four and "same
product with a toggle" and "mergeable, no fragmentation" are automatic. Fork any
one of them and we manufacture the fragmentation we're trying to avoid.

Consequences of holding it:
- **Merge is a *property*, not a feature we build.** Both doors read/write the same
  `gateway_memories` table addressed by `(orgId, scope, userId)`, via the shared
  `parseMemoryDirective`. So a user who starts standalone and *later* routes chat
  through the gateway keeps every memory — no migration, no separate namespace.
  Expansion is frictionless. Pitch: **"Start standalone. Go native whenever. Your
  memory comes with you."** Supermemory/Mem0 can't offer the second half — they have
  no native mode to expand into.

What to protect NOW (so the later docs/landing merge is painless):
1. **Keep `/v1/memory/*` as the standalone path — do NOT fork it.** No
   `memory.cencori.com`, no separate `/memory/v1/`. `/v1/` is versioning, not
   "gateway-ness"; a Mem0 user doesn't care. A separate path/subdomain IS the
   fragmentation.
2. **Identical directive across both doors** — `search` params and the `memory:`
   field never drift.
3. **One SDK namespace** — `cencori.memory` is self-contained enough to be "the
   product" for someone who never calls `cencori.chat`.

One caution: **make the native recall bonus legible as an upgrade, not a silent
standalone penalty.** Surface "native recall active" (response field / header) so
the delta reads as *"I unlocked something,"* not *"standalone is the crippled
version."* Standalone must be genuinely best-in-class on its own; native is the level-up.

Deferred (later, not blocking): docs framing ("Cencori Memory" as its own surface,
sharing the existing docs site) and a landing page. Naming/IA is downstream of the
unification principle above and can wait.

### The three tracks (this replaces the old linear phase order as the priority frame)

- **Track 0 — Earn the right (reliability; existential under managed):**
  paid Gemini tier + real fallback pool (Anthropic/Groq fallbacks currently have
  no pricing configured → overflow errors; fix or replace), per-customer quota
  fairness so one 50K-user tenant can't starve others, and **trustworthy writes**
  (writeback is async + silent today — make it observable via the fill gauge +
  a confirmed-written signal). See [[project-provider-capacity]].
- **Track 1 — Win recall (the visible edge over Mem0):** contradiction/dedup on
  writeback (supersede stale facts instead of storing duplicates — the exact
  Mem0 weakness), the unified graph (memory + RAG + profiles, temporal reasoning,
  importance decay), and a **public recall benchmark we win**.
- **Track 2 — Distribution / lock-in:** MCP bridge (`mcp.cencori.com` → memory
  readable from Claude Desktop / Cursor / Continue), `<MemoryInspector>` drop-in
  ("what we know about you" + one-click forget = GDPR as a feature), multi-modal
  memory (reuse existing Vision + Documents).

**Immediate next:** Track 0 #1–#3 (can't demo "giants fall" on a backend that
rate-limits mid-demo), then Track 1 contradiction/dedup.

### Stealing from the GPT thread (2026-07-18) — vetted, mapped to tracks

A GPT brainstorm (pasted by Bola) was ~90% confirmation of decisions already
locked here. Three ideas are worth keeping — everything else was either already
built or is future taxonomy. Do NOT let the "five memory types" (working /
episodic / semantic / procedural / organizational) balloon scope: we have
**semantic** (facts); the rest are later.

1. **Procedural memory** *(→ future bet, ties Memory to Gateway + Workflow).*
   Remember not just facts but **which model + prompt + tool-sequence previously
   produced a successful result**, and reuse it. Neither Mem0 nor Supermemory has
   this — it's a genuine moat because it requires sitting in the inference path
   (the seat). NOT first; slot after Track 1 recall quality is solid.

2. **`memory.context()` / `memory.process()` naming** *(→ Track 2 / standalone
   surface, when we touch the SDK).* Clearer names for the existing "self-managed
   orchestration" mode that currently ships as `recall()` / `remember()`.
   `context()` = retrieve + format an inject-ready block (no model call);
   `process()` = extract + write from an exchange. Rename/alias when we polish the
   standalone product face — not a behavior change, just clarity.

3. **Tagline: "Your application changes models. Its memory should not."**
   *(→ positioning).* Sharpest one-liner for provider-independent intelligence
   continuity — memory belongs to one provider (us) and survives the app switching
   OpenAI → Claude → Gemini → Cencori Compute. Pair with "The persistent
   intelligence layer behind every model interaction." Use on the eventual landing
   page; keep alongside "The memory layer of the AI cloud."

**Guardrail:** the GPT thread's "catch" list (prevent false memories, resolve
contradictions + time, avoid irrelevant recall, tenant isolation, no prompt-based
memory poisoning, ultra-low latency, decide what to never store, explain why a
memory was recalled, evaluate answer quality not just retrieval similarity) is NOT
new scope — it *is* Track 0 + Track 1 restated. That's the real work; treat it as
the acceptance criteria for those tracks, not a fourth track.

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
7. ~~**BYOK-compatible.** Embeddings for memory use whichever embedding model
   the project is configured for — including the customer's own key.~~
   **SUPERSEDED 2026-07-18 — memory is managed-only.** Embeddings run on
   Cencori's managed Gemini (`gemini-embedding-001`); no per-customer BYOK for
   memory. See the "Managed-only" decision above.

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

### Phase 3 — The reasoning layer (Track 1: "win recall") — build plan

**Framing (scoped 2026-07-18).** Phase 1 shipped a *semantic vector store*, not
memory: the write path is a blind `.insert()` (`lib/memory/writeback.ts:108`) and
the read path is pure cosine top-K (`lib/memory/retrieval.ts:78` →
`match_gateway_memories`). That is enough to *demo* recall; it is not enough to
make anyone leave Mem0/Zep/Supermemory. Those products' moat is the **reasoning
layer on top of storage** — conflict resolution, temporal validity, decay, graph.
Phase 3 builds that layer *on top of the existing store* (no rewrite; isolation,
quota, redaction, fail-open all stay). This is Track 1 from the priority frame
above, and it is the work that earns "leave Mem0 and don't look back."

**Non-negotiable rule: nothing in Phase 3 ships without moving a number on the
eval harness (Layer 0).** "Memory has to be sooo good" is unmeasurable today.
Every layer below has an acceptance metric the harness reports.

**Prerequisite — schema drift to close first.** The `Memory` TS type in this doc
claims `updatedAt`, `lastAccessedAt`, `accessCount`, `region`, but the live
`gateway_memories` table (migration `20260710_000000_gateway_memory.sql`) has only
`created_at` + `expires_at`. Layers 1/3/4 depend on these columns. First migration
of Phase 3 adds: `updated_at`, `last_accessed_at`, `access_count int default 0`,
`status text default 'active'` (`active|superseded|expired`), `superseded_by uuid`,
`valid_from timestamptz`, `valid_to timestamptz`, `content_hash text`, plus a
`reinforcement_count`. See [[project-schema-drift-incident]] — verify against LIVE
schema, do not assume the migration file reflects prod.

---

#### Layer 0 — Eval harness *(build first; it is the gate for everything else)*

- **What:** a fixed, versioned benchmark: N multi-session conversation transcripts
  + a question set with graded gold answers, scored on **answer quality** (LLM-judge
  + exact-match where possible), not cosine similarity. Include the adversarial
  cases from the GPT "catch" list: contradiction-over-time, stale-fact supersession,
  irrelevant-recall (precision), multi-hop, and never-store (secrets/PII leakage).
- **Why:** you cannot perfect what you cannot measure, and you cannot safely stack
  Layers 1–5 without a scoreboard that catches regressions. This is also the
  **public recall benchmark we win** (Track 1) — build it to be publishable.
- **Build:** offline runner (`scripts/memory-eval/` or `lib/memory/eval/`) that
  seeds a throwaway org/project, replays transcripts through the real write path,
  runs the question set through the real retrieval path, and emits a scorecard
  (recall@k, precision, contradiction-resolution rate, leak count, p95 latency).
  Base it on public methodology (LoCoMo / LongMemEval-style) so results are credible.
- **Acceptance:** harness runs green in CI against a seeded DB and prints a baseline
  scorecard for today's blind-insert/cosine system. That baseline is the number
  every later layer must beat.

#### Layer 1 — Conflict resolution on write *(the Mem0 core; biggest perceived-intelligence jump)*

- **What:** replace the blind insert with **ADD / UPDATE / DELETE / NOOP**. On each
  extracted fact, embed it, fetch the top semantically-similar existing memories in
  the same `(org, scope, scope_key, namespace)`, and have an LLM (cheap model, e.g.
  `gemini-2.5-flash`) decide: new fact (ADD), refines/replaces an existing one
  (UPDATE → rewrite content + bump `updated_at`, keep id so history is stable),
  contradicts an existing one (supersede: mark old `status='superseded'`,
  `superseded_by=new.id`), or already known (NOOP). Exact-dup guard via `content_hash`
  before the LLM call to save tokens.
- **Why:** today "I use Python" then "I moved to Rust" stores **both** and injects
  **both** — the exact failure that makes memory feel like a log. This is the single
  most-cited Mem0 differentiator and the #1 reason to switch.
- **Touch:** `lib/memory/writeback.ts` (the insert), new
  `lib/memory/reconcile.ts` (the decision call), `gateway_memories` status columns.
  Runs in the existing async `waitUntil` writeback — no added chat latency.
- **Acceptance:** harness contradiction-resolution rate goes from ~0 to >90%;
  duplicate-storage rate drops to near-0; **no regression** in recall@k or leak count.

#### Layer 2 — Reranking on read *(biggest retrieval-quality jump; independent of Layer 1)*

- **What:** retrieve a wider candidate set (e.g. top-30 by cosine) then **rerank** to
  final top-K by a scoring function combining semantic similarity + recency +
  `importance` + `access_count`, with MMR for diversity (drop near-duplicate hits).
  Optionally add hybrid keyword (BM25/`tsvector`) recall so exact-term facts aren't
  missed by pure vector search. Cross-encoder rerank is a later upgrade if a managed
  reranker is available; formula-based reranking is the v1.
- **Why:** pure cosine top-K over-returns semantically-near-but-irrelevant facts and
  ignores recency — hurts both precision and the "why did it recall that?" story.
- **Touch:** `match_gateway_memories` RPC (return wider set + fields), new ranking in
  `lib/memory/retrieval.ts`. Keep the provider-calibrated threshold work already in
  `types.ts` (`DEFAULT_RETRIEVAL_THRESHOLD`).
- **Acceptance:** harness precision + recall@k both improve vs Layer-1 baseline;
  p95 retrieval overhead stays <150ms (the locked latency budget).

#### Layer 3 — Temporal validity *(the Zep/Graphiti-class story)*

- **What:** give facts *bi-temporal* validity — `valid_from`/`valid_to` (when the
  fact was true in the world) distinct from `created_at`/`updated_at` (when we
  learned it). Supersession from Layer 1 sets `valid_to` on the old fact instead of
  hard-deleting, so history is queryable: "what did the user prefer *before* they
  switched?" Default retrieval filters to currently-valid (`status='active'` /
  `valid_to is null`); an explicit `asOf` directive can query historical state.
- **Why:** contradictions resolved *by time*, not just overwritten — lets memory
  survive a year of use without collapsing into a tangle, and unlocks temporal
  questions no flat store can answer.
- **Touch:** temporal columns (prereq migration), `match_gateway_memories` validity
  filter, optional `asOf` on `MemoryDirective` (`lib/memory/types.ts`).
- **Acceptance:** harness "state-at-time" questions answerable; current-state recall
  unaffected; superseded facts never injected into a default (non-`asOf`) turn.

#### Layer 4 — Importance decay + reinforcement

- **What:** `importance` stops being a write-once constant. **Reinforce** on recall
  (a fact retrieved/used bumps `access_count` + `last_accessed_at` and its effective
  weight); **decay** unused low-importance facts over time (time-based half-life on an
  *effective* score, computed at read or by a periodic job — never destroys the raw
  `importance`). Feeds the Layer-2 ranker. Trivia fades; load-bearing facts persist.
- **Why:** keeps recall sharp as the store grows and gives the quota fill-gauge a
  natural pressure valve (decayed trivia is the first eviction candidate at 100%).
- **Touch:** `access_count`/`last_accessed_at` update on retrieval (Layer 2 already
  touches read), effective-score formula shared with the ranker, optional cron for
  batch decay.
- **Acceptance:** harness precision holds as transcript volume scales up (the
  "1 year of use" stress set); reinforced facts rank above stale peers.

#### Layer 5 — Entity / graph layer *(deepest; do last, once 0–4 are proven)*

- **What:** extract entities + relationships alongside flat facts (`user → building →
  Ledgerkit`, `John → works_at → Zap`), with **entity resolution / merging** ("John
  from Zap" == "John Smith @ Zap Corp"). New `memory_entities` +
  `memory_entity_edges` tables keyed by the same `(org, scope, scope_key)` boundary.
  Retrieval can then do multi-hop ("who does Sarah report to?") that pure similarity
  cannot. This is the **unified graph** (memory + RAG + profiles) named in Track 1.
- **Why:** the last structural gap vs Zep/Supermemory; turns memory from a fact list
  into a queryable model of the user's world.
- **Touch:** new tables + migrations, entity-aware extraction in
  `lib/memory/extraction.ts`, graph-walk retrieval path, hard org-boundary property
  tests on the new tables (same zero-leak contract as `gateway_memories`).
- **Acceptance:** harness multi-hop questions answerable; entity-merge precision
  measured; zero cross-org edges (property test).

---

**Rides on top of these layers (not blockers, sequence opportunistically):**

- **Forget-with-filter** — `forget everything about my former employer`: semantic +
  entity-scoped deletion (Layer 5 makes it precise), real removal + cryptographic
  receipt in the audit log (the governance contract). 
- **Dashboard graph explorer** — per-user memory/entity graph view; folds into the
  dashboard memory surface (currently a redirect stub at
  `app/(app)/[orgSlug]/[projectSlug]/memory/page.tsx`).
- **"Explain why recalled"** — surface the ranker's reason per injected memory
  (from Layer 2 scoring); directly answers the GPT-thread catch item and is a trust
  feature for `<MemoryInspector>`.

**Explicitly OUT of Phase 3 scope** (guardrail against the five-types balloon):
procedural memory (post-Track-1 future bet), the other memory *types* (working /
episodic / organizational), and cross-workflow sharing (Phase 4). Phase 3 makes the
**semantic** layer world-class; nothing more.

**Dependency order:** 0 → (1 ‖ 2 in parallel) → 3 → 4 → 5. Layers 1 and 2 are
independent and can be built concurrently; 3 depends on 1's supersession; 4 depends
on 2's read-path hook; 5 is standalone but last because it's the heaviest and least
proven.

**Ship criteria:** memory that survives a year of use without becoming a tangled
contradiction — *and a public benchmark scorecard, produced by Layer 0, where
Cencori beats Mem0/Zep on answer quality.*

---

### Phase 3.5 — Progressive disclosure: index-then-fetch retrieval (added 2026-07-25)

**Origin.** Prompted by Aster (@try_aster / Chizi) shipping this pattern: "remembers
a lot but only shows a little — each turn it sees a short list of what it knows,
like a table of contents, and pulls the full note only when it actually needs it."
His framing — *"remembering is easy; knowing what to bring up right now is the hard
part, and that's where most of the work went"* — is our own thesis restated, and it
validates the whole reasoning layer. But it also names one technique we don't do.

**What we do today vs what this adds.** Retrieval currently *injects top-K*: rerank
(Layer 2), then drop the full memory contents into the system block every turn. That
is correct for the **single-shot gateway** (`/v1/chat/completions`) where there is no
agentic loop to fetch on demand. It is *not* optimal for the **agent/session path**
(Sessions API + Arcie), where dumping full memories every turn pollutes context and
buries the signal (Aster's point #2).

**The addition — a second retrieval MODE, not a replacement:**
- **inject mode** (default, gateway): today's behaviour — rerank → inject top-K full
  contents. Keep as-is for stateless completions.
- **index mode** (sessions/agents): inject a compact **table of contents** — the
  reranked top-N as `{id, one-line summary}` lines, cheap in tokens — and expose a
  `memory.fetch(id)` tool the model calls only when it needs the full note. The
  Layer-2 rank score decides TOC ordering; Layer-4 strength can prune what even makes
  the TOC. Requires a stored/derived one-line summary per memory (cheap: generate at
  write time alongside extraction, or lazily).

**Why this is ours to win, not just copy.** Aster hand-built this for one local,
single-user coding agent over plain-text files. We can offer it as a *managed mode*
on multi-tenant infra, composed with conflict-resolution + temporal + decay + the
org-isolation boundary — i.e. the reasoning layer he says "most of the work went
into" becomes a config flag. It also sharpens the standalone pitch to Aster-*like*
builders (see the standalone-as-product principle above): "bring any model; the
what-to-surface layer you'd otherwise hand-roll is our product."

**Scope guard.** This is a retrieval *mode*, not a new store. One store, one directive
shape; `mode: 'inject' | 'index'` on the memory directive. Do NOT fork a second
memory product for agents.

**Ship criteria:** an Arcie/session agent runs with `memory.mode = 'index'`, sees a
token-cheap TOC each turn, fetches full notes on demand, and the eval harness shows
equal-or-better answer quality at materially lower injected-context tokens vs inject
mode.

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
