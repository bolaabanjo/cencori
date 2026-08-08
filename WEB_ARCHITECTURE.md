# Cencori Web Architecture

Cencori Web is the first-party perception layer for Cencori agents. The V1 implementation owns the request path, page retrieval, extraction, storage, ranking, and citation evidence. It does not depend on a hosted web-search API.

## V1 data path

```text
seed URLs -> robots policy -> SSRF-safe fetch -> HTML extraction
          -> canonicalization -> project corpus -> PostgreSQL FTS
          -> freshness ranking -> evidence-bearing search results
```

The indexed and live paths remain separate:

- `/api/v1/web/fetch` retrieves a bounded text resource.
- `/api/v1/web/extract` converts a resource into text, links, metadata, and evidence spans.
- `/api/v1/web/crawl` explores a bounded URL frontier and persists project-private documents.
- `/api/v1/web/search` searches the Cencori public collection and the authenticated project's collection.

The OpenAI-compatible Responses `web_search_preview` tool calls the same internal search layer.

## Security boundary

Page content is hostile data. Retrieval rejects local, private, reserved, credential-bearing, and non-HTTP destinations; revalidates every redirect; enforces `robots.txt`; caps bytes and execution time; and marks returned content as untrusted. Browser execution is intentionally outside the application process and is not part of V1.

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

## Next layers

1. Per-host distributed politeness budgets and adaptive crawl-delay enforcement.
2. An isolated browser pool for JavaScript pages, screenshots, and interaction.
3. Content chunking, dense retrieval, learned reranking, authority, diversity, and spam signals.
4. Snapshot/object storage for immutable raw responses and citation replay.
5. Vertical indexes for code, documentation, research, news, and company intelligence.
