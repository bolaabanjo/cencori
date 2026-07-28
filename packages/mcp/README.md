# @cencori/mcp

**MCP server for Cencori — docs, gateway, memory, agents, sessions, governance, and multimodal inference for AI agents.**

Expose Cencori documentation and authenticated platform operations to AI clients (Cursor, Claude Desktop, etc.) via the [Model Context Protocol](https://modelcontextprotocol.io).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## What this package does

`@cencori/mcp` is a **thin stdio adapter**. It does not embed business logic — each MCP tool maps to an existing Cencori HTTP endpoint, and the platform enforces its own auth, tier gating, and governance rules.

Tools are organized into **action tiers**:

| Tier | Gate | What |
|------|------|------|
| **Read** | API key present | metrics, health, quota, list/get across memory, sessions, agents, governance |
| **Write** (inference) | `CENCORI_MCP_WRITE=1` | run models: chat, RAG, embeddings, vision, documents, images, moderation |
| **Destructive** | `CENCORI_MCP_DESTRUCTIVE=1` | *(Phase 2+)* delete / approve / reject |
| **Manual (never executed)** | — guidance only | API keys, governance activation, billing, member/access changes → `how_to_*` tools return steps + a dashboard link |

Reads are safe by default. Anything that costs money or changes state is opt-in. Security-sensitive actions (API keys, billing, access, policy activation) are **never** performed by the MCP — it only tells the user how to do them.

---

## Quick start

```bash
npx @cencori/mcp
```

Docs + `how_to_*` guidance tools work with **no API key**. Add `CENCORI_API_KEY` for reads; add `CENCORI_MCP_WRITE=1` to enable inference.

---

## Tools

### Public — no API key

| Tool | Description |
|------|-------------|
| `search_docs` / `get_doc` / `list_docs` | Search / fetch / list Cencori documentation |
| `get_integration_guide` | Fetch the full `llm.txt` integration contract — the authoritative "how to set up Cencori in a codebase" guide |
| `how_to_create_api_key`, `how_to_edit_api_key`, `how_to_revoke_api_key` | Guidance: API-key lifecycle (manual) |
| `how_to_activate_policy`, `how_to_respond_to_change_request` | Guidance: governance checker steps (manual) |
| `how_to_change_plan`, `how_to_manage_billing` | Guidance: billing / plan / credits (manual) |
| `how_to_manage_members` | Guidance: members / roles / SSO (manual) |

### Read — requires `CENCORI_API_KEY`

| Area | Tools |
|------|-------|
| Gateway | `list_models`, `get_metrics`, `get_health`, `check_quota` |
| Agents | `list_agents`, `get_agent`, `poll_agent_actions` |
| Memory | `list_memories`, `search_memory`, `get_memory`, `list_memory_entities`, `get_memory_graph`, `get_forget_suggestions` |
| Sessions | `list_sessions`, `get_session`, `get_session_events` |
| Governance | `list_policies`, `list_roles`, `list_change_requests`, `get_governance_ledger`, `get_governance_evidence`, `list_governance_templates` |

### Write — requires `CENCORI_MCP_WRITE=1`

- **Inference:** `generate_text`, `generate_rag`, `create_embeddings`, `moderate_content`, `generate_image`, `describe_image`, `ocr_image`, `classify_image`, `extract_document`, `summarize_document`, `query_document`, `text_to_speech`, `transcribe_audio`.
- **Memory:** `remember_memory`, `write_memory`, `create_namespace`.
- **Agents:** `create_agent`, `update_agent`.
- **Sessions:** `create_session`, `add_session_turn`.
- **Governance (draft only):** `create_policy`, `install_template`. Policies are created as **drafts** — activation stays a manual human step (`how_to_activate_policy`).

### Destructive — requires `CENCORI_MCP_DESTRUCTIVE=1` (implies write)

`delete_memory`, `delete_agent`, `delete_session`, `approve_session`, `reject_session`. All carry `destructiveHint` so clients can confirm.

> Roadmap: audio (TTS/STT) once binary/multipart transport lands.

---

## Cursor / Claude Desktop config

### Docs + guidance only (zero setup)

```json
{
  "mcpServers": {
    "cencori": { "command": "npx", "args": ["-y", "@cencori/mcp"] }
  }
}
```

### Reads across the platform

```json
{
  "mcpServers": {
    "cencori": {
      "command": "npx",
      "args": ["-y", "@cencori/mcp"],
      "env": { "CENCORI_API_KEY": "csk_..." }
    }
  }
}
```

### Reads + inference

```json
{
  "mcpServers": {
    "cencori": {
      "command": "npx",
      "args": ["-y", "@cencori/mcp"],
      "env": { "CENCORI_API_KEY": "csk_...", "CENCORI_MCP_WRITE": "1" }
    }
  }
}
```

See [`mcp.example.json`](./mcp.example.json) for a copy-paste template.

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CENCORI_DOCS_BASE_URL` | No | `https://cencori.com` | Host for docs API (`/api/docs/*`) |
| `CENCORI_BASE_URL` | No | `https://cencori.com` | Host for platform API (`/api/v1/*`, `/api/ai/*`) |
| `CENCORI_API_KEY` | For platform tools | — | Project API key (`csk_...`). **Must be spelled `CENCORI_API_KEY`** |
| `CENCORI_MCP_WRITE` | No | `false` | Enable inference (and, later, additive writes) |
| `CENCORI_MCP_DESTRUCTIVE` | No | `false` | Enable destructive actions (implies `WRITE`). No effect until Phase 2 |
| `CENCORI_MCP_FEATURES` | No | all enabled | Comma list: `docs`, `guidance`, `gateway`, `agents`, `memory`, `sessions`, `governance`, `multimodal` |

### Behavior

| `CENCORI_API_KEY` | Flag | Registered |
|-------------------|------|-----------|
| unset | — | docs + `how_to_*` guidance only |
| set | — | guidance + all **reads** |
| set | `CENCORI_MCP_WRITE=1` | + **writes** (inference, memory, agents, sessions) |
| set | `CENCORI_MCP_DESTRUCTIVE=1` | + **destructive** (delete/approve/reject); implies write |

Restart the MCP server after changing env vars.

---

## Development

```bash
cd packages/mcp
npm install
npm run build   # tsup → dist/index.js (stdio entry)
npm start       # run server on stdio
npm test        # build + integration tests
```

### Package layout

```
src/
├── index.ts          # stdio entrypoint
├── server.ts         # McpServer wiring + tiered registration
├── config.ts         # env parsing + capability flags
├── client.ts         # PlatformClient (Bearer → /api/*, get/post/patch/del)
├── http.ts           # shared fetch timeout + error body parsing
├── tools.ts          # barrel exports
├── docs/client.ts    # DocsClient (fetch → /api/docs/*)
└── tools/
    ├── shared.ts     # annotation tiers + jsonResult()
    ├── docs.ts, gateway.ts, agents.ts
    ├── memory.ts, sessions.ts, governance.ts
    ├── multimodal.ts # inference (Write-tier)
    └── guidance.ts   # how_to_* manual-only guidance
test/
└── integration.test.mjs
```

### Build notes

- **Shebang:** Added by `tsup.config.ts` banner. Do not add `#!/usr/bin/env node` to `src/index.ts`.
- **Logging:** `console.error()` only — stdout is JSON-RPC.
- **Auth:** `Authorization: Bearer <key>` works for both `/api/v1/*` and `/api/ai/*` (gateway accepts it alongside `CENCORI_API_KEY`).

---

## Testing

```bash
npm test
```

Runs HTTP + MCP-stdio tests. Tool-composition/tiering tests run offline (no key). Set `CENCORI_API_KEY` to also run authenticated read tests.
