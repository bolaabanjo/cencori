# @cencori/mcp

**Read-only MCP server for Cencori docs, gateway, and agents.**

Expose Cencori documentation and authenticated platform reads to AI clients (Cursor, Claude Desktop, etc.) via the [Model Context Protocol](https://modelcontextprotocol.io).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## What this package does

`@cencori/mcp` is a **thin stdio adapter**. It does not embed business logic. Each MCP tool maps to an existing Cencori HTTP endpoint:

| Tier | Auth | Tools | Backend |
|------|------|-------|---------|
| Public | None | `search_docs`, `get_doc`, `list_docs` | `/api/docs/*` |
| Platform | `CENCORI_API_KEY` | `list_models`, `get_metrics`, `list_agents`, `get_agent` | `/api/v1/*` |

Platform tools are registered **only at startup** when an API key is present. No writes in v1.

---

## Quick start

```bash
npx @cencori/mcp
```

No API key required for docs tools. Add `CENCORI_API_KEY` to enable gateway and agent tools.

---

## Tools (v1)

| Tool | Auth | Description |
|------|------|-------------|
| `search_docs` | Public | Search docs by keyword |
| `get_doc` | Public | Fetch raw markdown for a page by slug |
| `list_docs` | Public | List the docs table of contents by section |
| `list_models` | API key | List models available through the gateway |
| `get_metrics` | API key | Gateway usage metrics (`period`: `1h`, `24h`, `7d`, `30d`, `mtd`) |
| `list_agents` | API key | List agents in the authenticated project |
| `get_agent` | API key | Fetch one agent configuration by ID |

All tools declare `readOnlyHint: true`.

---

## Cursor / Claude Desktop config

Add to your MCP config (e.g. `~/.cursor/mcp.json` or project `.cursor/mcp.json`):

### Docs only (zero setup)

```json
{
  "mcpServers": {
    "cencori": {
      "command": "npx",
      "args": ["-y", "@cencori/mcp"]
    }
  }
}
```

### Full v1 (docs + gateway + agents)

```json
{
  "mcpServers": {
    "cencori": {
      "command": "npx",
      "args": ["-y", "@cencori/mcp"],
      "env": {
        "CENCORI_API_KEY": "",
        "CENCORI_MCP_FEATURES": "docs,gateway,agents"
      }
    }
  }
}
```

### Local development (monorepo)

```json
{
  "mcpServers": {
    "cencori": {
      "command": "node",
      "args": ["./packages/mcp/dist/index.js"],
      "env": {
        "CENCORI_DOCS_BASE_URL": "http://localhost:3000",
        "CENCORI_BASE_URL": "http://localhost:3000",
        "CENCORI_API_KEY": "csk_..."
      }
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
| `CENCORI_BASE_URL` | No | `https://cencori.com` | Host for platform API; MCP calls `/api/v1/*` on this host |
| `CENCORI_API_KEY` | For platform tools | — | Project API key (`csk_...`). **Must be spelled `CENCORI_API_KEY`** |
| `CENCORI_MCP_READ_ONLY` | No | `true` | Reserved for future write gating; v1 has no write tools |
| `CENCORI_MCP_FEATURES` | No | all enabled | Comma list: `docs`, `gateway`, `agents` |

### Feature flag behavior

| `CENCORI_API_KEY` | `CENCORI_MCP_FEATURES` | Tools registered |
|-------------------|------------------------|------------------|
| unset | any | 3 docs tools only |
| set | `docs` | 3 docs tools only |
| set | `docs,gateway` | docs + `list_models`, `get_metrics` |
| set | `docs,agents` | docs + `list_agents`, `get_agent` |
| set | `docs,gateway,agents` (or omitted) | all 7 tools |

Restart the MCP server after changing env vars.

---

## Development

```bash
cd packages/mcp
npm install
npm run build   # outputs dist/index.js (stdio entry)
npm start       # run server on stdio (for manual debugging)
npm test        # build + integration tests
```

### Package layout

```
src/
├── index.ts          # stdio entrypoint
├── server.ts         # McpServer wiring + conditional registration
├── config.ts         # env parsing
├── client.ts         # PlatformClient (Bearer → /api/v1/*)
├── http.ts           # shared fetch timeout + error body parsing
├── tools.ts          # barrel exports
├── docs/client.ts    # DocsClient (fetch → /api/docs/*)
└── tools/
    ├── shared.ts     # annotations + jsonResult()
    ├── docs.ts
    ├── gateway.ts
    └── agents.ts
test/
└── integration.test.mjs
```

### Build notes

- **Shebang:** Added by `tsup.config.ts` banner to `dist/index.js`. Do not add `#!/usr/bin/env node` to `src/index.ts` — duplicate shebang breaks Windows.
- **Logging:** Use `console.error()` only. Never `console.log()` — stdout is JSON-RPC.
- **Platform client:** Uses direct `fetch`, not the published `cencori` npm SDK (npm 1.2.1 lacks `agents` namespace). See spec §5.2.

---

## Testing

```bash
cd packages/mcp
npm test
```

Runs 13 integration tests:

- 3 direct HTTP tests against docs API
- 4 MCP stdio tests (docs, no key required)
- 6 authenticated MCP tests (require `CENCORI_API_KEY`)

**Load API key from repo `.env` (PowerShell):**

```powershell
Get-Content ..\.env | ForEach-Object {
  if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}
npm test
```

**Expected with key (July 2026):** 12 passed, 1 skipped if project has no agents (`get_agent`).

---

## Architecture

```
Cursor / Claude Desktop
        │
        ▼  JSON-RPC over stdin/stdout
  @cencori/mcp  (McpServer + tool handlers)
        │
        ├── DocsClient ──────► GET /api/docs/{search,raw,navigation}
        │
        └── PlatformClient ──► GET /api/v1/{models,metrics,agents}
              (Authorization: Bearer only)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Only 3 tools, expected 7 | Set `CENCORI_API_KEY` in MCP config env (not just `.env` in repo) |
| Key set but still 3 tools | Check spelling: `CENCORI_API_KEY` not `CENCOR_API_KEY` |
| `SyntaxError` at shebang on Windows | Rebuild; ensure no shebang in `src/index.ts` |
| Agent tools error at runtime | Use current `PlatformClient` (direct fetch); don't use npm `cencori` SDK for agents yet |
| Changes to env not reflected | Restart MCP server / reload Cursor |

---

## Publishing

Not yet published. See [`packages/PUBLISHING.md`](../PUBLISHING.md).

```bash
cd packages/mcp
npm run build
npm publish --access public
```

Bump `version` in `package.json` before publish.

---

## License

MIT
