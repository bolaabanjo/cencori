# Workflow Log

## 2026-07-06 — Cencori MCP authoritative v1 spec

**What/why:** Created `anthony/cencori-mcp.md` — compressed reverse-engineering brief + product spec for Cencori MCP v1. Documents stdio-first deployment, API-key auth, committed scope (docs + gateway/agents), access points, security, future layers, decision log, and build checklist.

**Files changed:**
- `anthony/cencori-mcp.md` — new authoritative MCP spec
- `anthony/mcp-v1.md` — added pointer to authoritative spec
- `workflow.md` — this entry

**Verification:** Doc-only; no build/test run.

**Status:** Not committed/pushed.

**Next steps:** Restructure `packages/mcp` per §4.3; implement gateway + agents tools per §12 checklist.

## 2026-07-06 — Cencori MCP full v1 package wiring

**What/why:** Expanded `packages/mcp` from a docs-only MCP server into the spec-aligned v1 package shape. Split tool registration into docs/gateway/agents groups, added env-driven config and authenticated platform access, renamed the server to `cencori`, and updated package docs/examples to match the full v1 surface.

**Files changed:**
- `packages/mcp/src/config.ts` — added `CENCORI_BASE_URL`, `CENCORI_API_KEY`, `CENCORI_MCP_READ_ONLY`, and `CENCORI_MCP_FEATURES` parsing
- `packages/mcp/src/client.ts` — added authenticated platform client using the `cencori` SDK plus direct fetches for gateway routes
- `packages/mcp/src/tools.ts` — converted to barrel exports for split tool modules
- `packages/mcp/src/tools/shared.ts` — centralized read-only annotations and JSON result formatting
- `packages/mcp/src/tools/docs.ts` — moved docs tools into a dedicated module
- `packages/mcp/src/tools/gateway.ts` — added `list_models` and `get_metrics`
- `packages/mcp/src/tools/agents.ts` — added `list_agents` and `get_agent`
- `packages/mcp/src/server.ts` — renamed the server to `cencori` and conditionally registered feature groups
- `packages/mcp/src/index.ts` — updated startup logging to reflect config and enabled features
- `packages/mcp/package.json` — updated package description
- `packages/mcp/package-lock.json` — added installed `cencori` dependency metadata
- `packages/mcp/README.md` — documented the full v1 toolset and config options
- `packages/mcp/mcp.example.json` — updated example server name and authenticated env config
- `workflow.md` — this entry

**Verification:** `cd packages/mcp && npm run build`; `ReadLints` on `packages/mcp` returned no errors.

**Status:** Not committed/pushed.

**Next steps:** Manually test the authenticated tools against a real `CENCORI_API_KEY` and local/production base URLs, then update the MCP spec checklist/decision log if you want the documentation to reflect the shipped state.

## 2026-07-06 — Cencori MCP integration tests

**What/why:** Added live integration tests for `@cencori/mcp` covering public docs APIs and stdio MCP tool calls. Fixed duplicate shebang in built `dist/index.js` that prevented the server from starting on Windows.

**Files changed:**
- `packages/mcp/test/integration.test.mjs` — new integration test suite (docs API + MCP stdio client)
- `packages/mcp/package.json` — added `npm test` script
- `packages/mcp/src/index.ts` — removed source shebang; tsup banner now owns the bin shebang
- `workflow.md` — this entry

**Verification:** `cd packages/mcp && npm test` — 7 passed, 6 skipped (no `CENCORI_API_KEY` in env). Passed: docs search/get/list APIs, docs-only tool registration, and MCP `search_docs`/`get_doc`/`list_docs` via stdio.

**Status:** Not committed/pushed.

**Next steps:** Re-run `npm test` with `CENCORI_API_KEY` set to exercise `list_models`, `get_metrics`, `list_agents`, and `get_agent`.

## 2026-07-06 — Cencori MCP test fixes (agents + env isolation)

**What/why:** Fixed two test failures: docs-only tool registration test now explicitly unsets `CENCORI_API_KEY` in the child process env, and agent tools now use direct fetch instead of the published `cencori` npm SDK (which lacks `agents` namespace on npm 1.2.1).

**Files changed:**
- `packages/mcp/src/client.ts` — removed SDK usage; all platform calls use direct fetch to `/api/v1/*`
- `packages/mcp/test/integration.test.mjs` — unset inherited API key for docs-only registration test
- `packages/mcp/package.json` — removed unused `cencori` dependency
- `packages/mcp/package-lock.json` — refreshed after dependency removal
- `workflow.md` — this entry

**Verification:** `cd packages/mcp && npm test` with `CENCORI_API_KEY` from `.env` — 12 passed, 1 skipped (`get_agent` — no agents in project).

**Status:** Not committed/pushed.

**Next steps:** Publish updated `cencori` SDK with agents namespace, or keep MCP on direct fetch until SDK catches up.

## 2026-07-06 — Cencori MCP documentation pass

**What/why:** Thorough documentation update after v1 implementation and test verification. Synced authoritative spec, package README, and extended reference with shipped state, testing guide, troubleshooting, and implementation decisions (direct fetch vs SDK, shebang, env var naming).

**Files changed:**
- `anthony/cencori-mcp.md` — updated status, architecture, code map, checklist, decision log; added §13 Testing and §14 Troubleshooting
- `packages/mcp/README.md` — expanded with layout, testing, env matrix, troubleshooting, publishing
- `anthony/mcp-v1.md` — status note pointing to authoritative spec
- `workflow.md` — this entry

**Verification:** Doc-only; no build/test run.

**Status:** Not committed/pushed.

**Next steps:** npm publish `@cencori/mcp`; update `get_agent` test once project has agents; publish workspace SDK with agents namespace.

## 2026-07-06 — Cencori MCP v1 fix review

**What/why:** Added `anthony/v1_fix.md` as a focused review document for `packages/mcp`. Captures the highest-value cleanup suggestions after the current v1 implementation: SDK-vs-fetch decision, dormant `readOnly` semantics, auth-header normalization, tool barrel cleanup, doc/code alignment, and test strategy.

**Files changed:**
- `anthony/v1_fix.md` — new fix/review document for MCP v1
- `workflow.md` — this entry

**Verification:** Doc-only review artifact; no build/test run.

**Status:** Not committed/pushed.

**Next steps:** Decide whether `PlatformClient` remains a direct-fetch adapter or converges on the SDK, then sync the authoritative MCP spec and README with that decision.
