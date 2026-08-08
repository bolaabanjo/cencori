# Cencori Web Crawl Runbook

## Deployment

1. Apply `supabase/migrations/20260808_000000_web_crawl_frontier.sql` after the Cencori Web base migration.
2. Set `WEB_CRAWL_ADMIN_SECRET` to a long random secret.
3. Deploy the API and seed the initial corpus explicitly.

There is no Vercel Cron dependency. The standalone crawler claims work directly from PostgreSQL and runs on any Node 20+ machine.

## Run continuously on a Mac or Linux host

The worker loads `.env.local` and `.env`, so ensure these values are available:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Build and run it:

```bash
npm run web:worker
```

After the first build, a process supervisor can restart the existing artifact without rebuilding:

```bash
npm run web:worker:start
```

On macOS, install it as a per-user `launchd` service:

```bash
npm run web:worker:install
npm run web:worker:status
```

The generated service contains no credentials. It starts the repository's built worker, which loads secrets from `.env.local`, and writes logs under `~/Library/Logs/Cencori/`. To stop and remove it:

```bash
npm run web:worker:uninstall
```

The process handles `SIGINT` and `SIGTERM`, stops claiming new batches, and emits JSON-line logs suitable for a local terminal, `launchd`, systemd, or a container log collector. For a single diagnostic pass:

```bash
WEB_CRAWL_RUN_ONCE=true npm run web:worker
```

### Mac sleep behavior

If the Mac sleeps, crawling pauses. Timers and network activity resume after wake, and PostgreSQL leases make interrupted work reclaimable; there is no local queue to repair. Closing a MacBook lid normally puts it to sleep.

For an open-lid Mac that should remain awake while the worker runs:

```bash
caffeinate -i npm run web:worker
```

`caffeinate` is not a reliable closed-lid server mode. For continuous crawling with the lid closed, use Apple's supported clamshell setup or move the same worker artifact to an always-on Mac, Linux server, or Cencori-owned host.

## Seed the public corpus

```bash
curl -X POST "$CENCORI_ORIGIN/api/internal/web/crawl" \
  -H "Authorization: Bearer $WEB_CRAWL_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "domains": ["docs.example.com"],
    "maxPages": 10000,
    "maxFrontier": 200000,
    "maxDepth": 2,
    "maxAttempts": 3
  }'
```

Seed authoritative, high-value domains first. A domain seed automatically adds its home page and conventional `/sitemap.xml`; the worker also consumes sitemap declarations from `robots.txt`.

## Observe progress

```bash
curl "$CENCORI_ORIGIN/api/internal/web/crawl" \
  -H "Authorization: Bearer $WEB_CRAWL_ADMIN_SECRET"

curl "$CENCORI_ORIGIN/api/internal/web/crawl/$JOB_ID" \
  -H "Authorization: Bearer $WEB_CRAWL_ADMIN_SECRET"
```

Important counters:

- `pagesDiscovered`: durable frontier size, including sitemap items.
- `pagesProcessed`: terminal page attempts; sitemap items do not consume this budget.
- `pagesIndexed`: successfully stored public documents.
- `pagesFailed`: pages exhausted after retries.
- `pagesSkipped`: terminal policy, content-type, size, or robots exclusions.

## Manual API worker run

```bash
curl -X POST "$CENCORI_ORIGIN/api/internal/web/crawl/worker" \
  -H "Authorization: Bearer $WEB_CRAWL_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"maxItems":25,"batchSize":5,"timeBudgetMs":45000,"scheduleRecrawls":true}'
```

Workers use job and frontier leases. A terminated process does not require manual cleanup; another invocation can reclaim expired leases. Transient network and storage failures are requeued with exponential delay.

## Search verification

After `pagesIndexed` increases, any authenticated project can search the shared corpus through `/api/v1/web/search` or `cencori.web.search(...)`. Public results are combined with that project's private crawl collection.
