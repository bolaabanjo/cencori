# Cencori Web Architecture

Cencori Web is the first-party perception layer for Cencori agents. The V2 implementation owns the request path, page retrieval, JavaScript browsing, extraction, storage, hybrid ranking, policy operations, and citation evidence. It does not depend on a hosted web-search API.

## V2 data path

```text
seed URLs -> crawler policy -> SSRF-safe fetch/browser -> extraction
          -> canonicalization -> local MiniLM embeddings -> PostgreSQL hybrid index
          -> lexical + semantic + authority + quality + freshness + spam ranking
          -> host/title diversity -> evidence-bearing search results
```

The indexed and live paths remain separate:

- `/api/v1/web/fetch` retrieves a bounded text resource.
- `/api/v1/web/extract` converts a resource into text, links, metadata, and evidence spans.
- `/api/v1/web/crawl` explores a bounded URL frontier and persists project-private documents.
- `/api/v1/web/search` searches the Cencori public collection and the authenticated project's collection.
- `/api/v1/web/browse` queues isolated JavaScript rendering and bounded interactions; `GET /api/v1/web/browse/:jobId` returns the result.
- `/api/v1/web/takedown` accepts authenticated copyright, privacy, legal, and crawler-policy requests.

The OpenAI-compatible Responses `web_search_preview` tool calls the same internal search layer.

## Security boundary

Page content is hostile data. Retrieval rejects local, private, reserved, credential-bearing, and non-HTTP destinations; revalidates redirects and browser subrequests; enforces `robots.txt`, `X-Robots-Tag`, and HTML robots directives; caps bytes and execution time; and marks returned content as untrusted. Browser execution runs in a separate leased worker, never in the API process. Persisted browser jobs reject password and secret-field interactions.

## Storage boundary

Cencori Web uses a domain-level data-store interface with a direct `pg` implementation. `CENCORI_WEB_DATABASE_URL` points the worker and API data path at vanilla Cencori-owned PostgreSQL. The Supabase adapter is a temporary fallback for deployments that have not moved the Web database yet; Supabase is not required by the crawler schema, leasing functions, index, or ranking path.

`web_documents.collection_id` makes corpus ownership explicit:

- `public` is Cencori's shared corpus and can only be populated by internal service-role jobs.
- `project:<uuid>` is a private project collection populated by customer crawl requests.

Search RPC access is service-role only and filters to the current project plus the public collection. Content hashes and retrieval timestamps make evidence reproducible even after a remote page changes.

## Durable public corpus

`web_crawl_jobs` and `web_crawl_frontier` provide the persistent crawler control plane. Workers claim one job with a time-bound lease, atomically claim a bounded batch, process pages concurrently, and release the job for the next invocation. Expired job and item leases are recoverable after process termination.

Discovery sources include:

- Explicit seed URLs and domains
- Conventional `/sitemap.xml` files
- `Sitemap:` declarations in `robots.txt`
- Nested sitemap indexes
- Same-origin page links that are not marked `nofollow`
- Scheduled recrawls from each public document's `next_crawl_at`

Frontier and page budgets are separate so large sitemaps cannot bypass the document limit. Retries use exponential delay, hard failures become terminal, and exhausting a page budget closes the unclaimed frontier tail.

Worker execution is deliberately platform-neutral. The standalone Node worker runs a continuous claim loop, schedules recrawls, backs off while idle, and shuts down cleanly on process signals. The protected `POST /api/internal/web/crawl/worker` remains available for bounded operator runs. Native macOS `launchd` supervisors keep both PostgreSQL and the worker alive without Vercel Cron, Cencori Compute, or a hosted scheduler.

## Hybrid retrieval and evaluation

The worker creates normalized 384-dimensional MiniLM embeddings locally. PostgreSQL stores four indexed locality buckets per embedding; search unions lexical matches with approximate semantic candidates, performs exact cosine scoring only on that candidate set, then applies authority, quality, freshness, spam, and diversity signals. Serverless API instances submit query text to a short-lived PostgreSQL lease queue; the owned embedding worker computes it locally, clears the query text immediately, and the API deletes the completed row after reading it. Model revision and checksum are pinned by `npm run web:model:install` so the same indexer and query worker can move unchanged from a Mac to Cencori hardware.

`config/web-corpus.json` defines the curated corpus with per-source path, language, authority, and budget constraints. `config/web-search-eval.json` defines repeatable relevance cases. `npm run web:eval` reports MRR, recall@k, nDCG@k, latency, and returned-domain coverage.

## Policy operations

Operator domain policies, takedown requests, and durable URL tombstones live in PostgreSQL. Deny/noindex policies remove existing matching documents, approved takedowns atomically create tombstones and delete indexed copies, and later crawls cannot resurrect tombstoned URLs. See `WEB_POLICY_RUNBOOK.md`.

## Next layers

1. Per-host distributed politeness budgets and adaptive crawl-delay enforcement.
2. Learned cross-encoder reranking after the evaluation corpus is large enough to train and measure it.
3. Snapshot/object storage for immutable raw responses and citation replay.
4. Additional vertical indexes for code, research, news, and company intelligence.
