# Cencori Memory — Walkthrough

> Companion to `MEMORY_ROADMAP.md`. The roadmap is the spec.
> This is the narrative.
> Written 2026-07-09.

---

## The 30-second mental model

Memory is a **property of a request**, not a separate product. You add
`memory: { userId }` to any chat call and the gateway does the rest —
retrieval, injection, PII redaction, extraction, embedding, storage, region
pinning, audit logs, forget. You never touch a vector store. Your app's
code doesn't change beyond that one field.

---

## The setup — five minutes

1. Sign up at cencori.com, grab an API key.
2. Dashboard → your project → **Memory: on**. Pick a scope default (`user`),
   a region (`us-east-1`), and a fact-extraction model (`gpt-4o-mini`
   default).
3. Add three characters to your existing chat call:

    ```diff
    - await cencori.chat.completions.create({ model, messages });
    + await cencori.chat.completions.create({ model, messages, memory: { userId } });
    ```

Ship.

---

## What happens inside on a memory-enabled request

1. **Request arrives** at the gateway edge. Auth, rate limit, spend cap
   checks fire (existing).
2. **Retrieval** (~40ms p50). The user's latest message is embedded.
   pgvector query, scoped to `(orgId, userId)`, returns top-K above the
   relevance threshold.
3. **Injection.** Retrieved memories are formatted as a system block ahead
   of the user's turn:

    ```
    Facts about this user:
    - Building a Next.js 15 app with TypeScript strict mode
    - Prefers Server Actions over API routes
    - Deployed to Vercel; uses pnpm
    - Project name: Ledgerkit — small business bookkeeping
    ```

4. **PII redaction** runs on the enriched prompt (existing pipeline).
5. **Provider dispatch** — OpenAI/Anthropic/whoever, honoring BYOK if set.
6. **Response streams back.** Latency-neutral vs. no-memory — memory adds
   only the ~40ms up front.
7. After the stream completes, **async fact extraction** runs on the
   exchange using the project's configured extraction model.
8. **PII redaction** on the extracted facts.
9. **Embed and write** to pgvector, region-pinned.
10. **Fill gauge updates.** Audit log entry emitted.
11. Response object includes what happened:

    ```json
    {
        "choices": [...],
        "memory": {
            "retrieved": 4,
            "written": 2,
            "quotaUsed": 0.47,
            "region": "us-east-1"
        }
    }
    ```

Writeback is async and doesn't block your response.

---

## Case study — CodeCraft, a Cursor-shaped code-gen app

CodeCraft is a hypothetical AI code-assistant. 2,000 users. They just turned
on Cencori memory.

**The layering matters:**
- **CodeCraft** is built on Cencori (uses Cencori for LLM + memory).
- **Sarah** is CodeCraft's end-user.
- **Ledgerkit** is what Sarah builds *inside* CodeCraft — a small-business
  bookkeeping app. Not itself an AI product in v1.

### Day 1 — Sarah's first session

Sarah signs up. First message: *"Help me build a small business bookkeeping
app."*

```ts
await cencori.chat.completions.create({
    model: 'claude-sonnet-4-6',
    messages: sarah.conversation,
    memory: { userId: 'sarah_e1f2' }
});
```

- Retrieval: empty. Sarah has no memories yet.
- Response: Claude asks her framework preference, database, etc.
- Sarah answers: TypeScript, Next.js 15, Postgres. Names it "Ledgerkit."
- Extraction: 4 facts written — *building Ledgerkit*, *prefers TypeScript*,
  *uses Next.js 15*, *uses Postgres*.
- Fill gauge: **0.4%** of the free tier.

### Day 3 — Sarah's fifth session

Sarah says: *"add authentication."*

- Retrieval: 4 memories injected. Claude sees her stack.
- Response: Claude doesn't ask "what framework?" — it writes Server-Action-
  based auth for her Next.js stack, defaulting to Clerk.
- Sarah: *"Actually I want NextAuth."*
- Response: switches. Extraction writes: *chose NextAuth over Clerk*, *wants
  auth via GitHub provider*.

### Day 4 — the 80% moment

40 active users × ~20 memories each = 800 memories. Fill gauge: **80%**.

- Dashboard banner: *"You're at 80% of your Free memory tier. Upgrade to
  Pro for 100,000 memories."*
- CodeCraft's owner gets the same in email.
- Owner clicks upgrade. Pro is active in ten seconds. Zero user-visible
  interruption. Writes never blocked.

### Day 30 — Sarah's hundredth session, on a new laptop

*"Let's keep working on it."*

- Retrieval returns top-5 by relevance + recency:
    ```
    - Ledgerkit: a Next.js 15 + TypeScript bookkeeping app
    - Uses NextAuth with GitHub provider
    - Last worked on: Stripe subscriptions, monthly + annual tiers
    - Prefers Server Actions over API routes
    - Uses shadcn/ui, doesn't want Tailwind classes directly in components
    ```
- Claude picks up exactly where she left off. Zero context re-establishment.

### Day 45 — the "new chat" moment (this is the killer case)

Sarah's current chat has 200 messages and is slow. She hits "new chat."

Types: *"let's keep going on Ledgerkit."*

- **Session** scope resets. Redis clears the ephemeral stuff.
- **User** scope still has 27 memories about Sarah's work on Ledgerkit.
- Retrieval finds the top-5 project-relevant memories, injects them.
- Claude responds with full continuity. Sarah never had to paste anything.

**This is the marketing hook.** *"Never lose context again."*

### Day 60 — Sarah wants to be forgotten

Sarah clicks "delete my data" in CodeCraft's settings.

```ts
await cencori.memory.forget({ userId: 'sarah_e1f2' });
```

- All 27 of Sarah's memories hard-deleted from pgvector.
- Audit log entry with a cryptographic receipt.
- Response includes a signed proof CodeCraft can show Sarah.
- Next login — Claude is a stranger to her again.

---

## The dashboard — what CodeCraft's team sees

- **Fill gauge:** single 0–100% bar. 47%.
- **Per-user distribution chart:** power users have 200+ memories, most
  have 10-30.
- **Memory search:** type "authentication" — see every matching memory,
  filter by user or scope. Debugging superpower.
- **Extraction config:** *"Extract facts about the codebase, framework
  choices, and design decisions. Skip small talk."* — written once,
  applied to every request.
- **Region:** `us-east-1`. Enterprise conversation adds EU later.

---

## The end-user page — MemoryInspector

Sarah's CodeCraft settings page:

```tsx
<MemoryInspector userId={session.user.id} />
```

Renders a grouped list:

- **Project (12)** — *Ledgerkit, a Next.js 15 bookkeeping app · Repo:
  github.com/sarah/ledgerkit · Vercel · ...*
- **Preferences (8)** — *NextAuth with GitHub · Server Actions · ...*
- **Recent (7)** — *Stripe subscription tiers · ...*

Each item: delete button. Bottom of page: "Delete everything." GDPR
right-to-be-forgotten UX out of the box, no work for CodeCraft.

---

## The MCP moment — Cursor knows Ledgerkit

Sarah opens Cursor locally. Adds her CodeCraft MCP token (Pro feature).

Types in Cursor: *"continue working on Ledgerkit — add a report page."*

Cursor calls `mcp.cencori.com`, which queries Sarah's memories, which get
injected into Cursor's context. Cursor now knows Next.js 15, NextAuth,
Server Actions, shadcn/ui, the Stripe work that just landed. Writes the
report page in her stack. No re-explaining.

**This is distribution moment #1.** Every dev using Cursor or Claude
Desktop has a reason to write to Cencori — because the memory follows
them into their editor.

---

## The compounding case — nesting

The case study intentionally has two layers, and there's a genuinely
powerful third case:

- **Level 1:** CodeCraft (AI product) uses Cencori for LLM + memory.
- **Level 2:** Sarah's end-user product Ledgerkit is *not* on Cencori
  because Ledgerkit isn't an AI product in v1.
- **Level 3 (compounding):** Sarah adds an AI feature to Ledgerkit —
  "summarize this month's expenses." CodeCraft scaffolds Cencori into
  Ledgerkit for her. **Ledgerkit is now also on Cencori.** Two levels of
  nesting, one distribution channel.

Marketable story: *"CodeCraft uses Cencori to build itself, and every AI
product shipped from CodeCraft uses Cencori too."*

Distribution moment #2: partner with dev-tool companies. If your product
helps devs ship AI features, ship Cencori as the default under those
features.

---

## Multi-tenant safety

Hard boundary at `organizationId`. Property-tested. No query path can
return memory X to org Y if X wasn't written by Y. That's the contract.
If we ever break it, it's a headline — treated as a P0 incident with
mandatory disclosure.

Sarah's memories on CodeCraft aren't visible to another Cencori-powered
app "ContractPilot." Those memories live in a different org's storage
and cannot cross.

---

## Cross-provider — memory doesn't care which model

CodeCraft's Monday session uses `claude-sonnet-4-6`. Their Tuesday A/B
test runs some users on `gpt-4o`. Their Wednesday code-completions use
`gpt-4o-mini`. Same memory, same retrieval, same injection. Provider
swap changes zero about memory behavior. This is the gateway advantage
— memory is above the provider layer.

---

## Session vs user scope — a practical distinction

- **`scope: 'session'`** — Redis-backed, short-lived, cleared on session
  end. Use for: "remember what we said 10 messages ago in this same
  chat." Cheap. Ephemeral.
- **`scope: 'user'`** — Postgres+pgvector, persistent, region-pinned.
  Use for: "remember Sarah across all her sessions forever." What the
  case study uses.
- **`scope: 'workspace'`** — Persistent, shared by all users in a
  workspace. Use for: "remember what our team decided about pricing
  tiers." Team memory.
- **`scope: 'org'`** — Persistent, shared org-wide. Use for: "remember
  the company's playbook."

Default: `user`. Most apps want that.

### The magic — session promotion

At end of session, an async promotion pass identifies important
session-scope memories and promotes them to user scope. Trivia decays
in Redis; material stuff sticks around. Threshold is configurable via
the extraction step's `minImportance`.

This is what makes memory feel magical rather than noisy.

---

## The namespace escape hatch — multi-project users

A user can have multiple projects. Memories should not bleed.

```ts
// Sarah's chat about Ledgerkit
memory: { userId: 'sarah_e1f2', namespace: 'proj_ledgerkit' }

// Sarah's chat about her personal website
memory: { userId: 'sarah_e1f2', namespace: 'proj_personal-site' }
```

Retrieval:
1. Top-K from `(userId, namespace='proj_ledgerkit')` — project-specific
2. Top-M from `(userId, namespace=null)` — cross-project user facts
   (framework preferences, style, tools that should carry everywhere)
3. Merge, re-rank by relevance, inject

Consumer apps get sidebar organization for free — each "project" the
user creates maps to a namespace. Cencori routes.

---

## The enterprise variant — briefly

Same pipeline. Region-pinned to EU (or wherever). Audit log flows to
their SIEM. PII detection tuned for PHI (healthcare) or PCI (banking).
Private tenant so their pgvector rows never share hardware with another
org. Custom SLA on retrieval latency. DPA in place. HIPAA BAA on demand.

For UBA GAP AI or a similar bank: memory that's audit-provable,
region-locked, and forget-verifiable — all built on the same primitive
CodeCraft uses.

---

## What CodeCraft actually pays

- Days 1-4: free. $0.
- Days 4+: Pro. $29-49/mo (TBD) for 100,000 memories.
- Month 12: crosses 100k active memories. Enterprise: contract for
  regional pinning + private tenant + higher retention. Ballpark
  $2k-5k/mo.

CodeCraft wrote **zero** vector-store code, **zero** PII redaction,
**zero** embedding pipeline, **zero** audit code. They shipped a
stateful AI product in an afternoon.
