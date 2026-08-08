# Cencori Web Crawl Runbook

## Deployment

1. Apply `supabase/migrations/20260808_000000_web_crawl_frontier.sql` and `supabase/migrations/20260808_120000_web_intelligence_v2.sql` after the Cencori Web base migration.
2. Set `WEB_CRAWL_ADMIN_SECRET` to a long random secret.
3. Deploy the API and seed the initial corpus explicitly.

## Owned PostgreSQL on macOS

Cencori Web can run against vanilla PostgreSQL without Supabase. With Homebrew PostgreSQL installed:

```bash
brew services start postgresql@14
createdb cencori_web
psql -v ON_ERROR_STOP=1 -d cencori_web -f database/web/bootstrap.sql
```

If Homebrew Services is unavailable, install Cencori's native per-user supervisor after the database has been initialized:

```bash
npm run web:db:install
npm run web:db:status
```

`web:db:uninstall` stops the service but deliberately preserves the PostgreSQL data directory.

Create an ignored `.env.web.local` file used only by the crawler tools:

```bash
CENCORI_WEB_DATABASE_URL=postgresql://localhost/cencori_web
CENCORI_WEB_DATABASE_POOL_SIZE=10
```

`CENCORI_WEB_STORE` can explicitly select `postgres` or `supabase`; its default is `auto`. The explicit selector allows two workers built from the same artifact to run side by side even when `.env.web.local` configures owned PostgreSQL.

When `CENCORI_WEB_DATABASE_URL` is set, the worker, seed command, authenticated search route, project crawl route, and internal crawl APIs use the direct PostgreSQL store. Supabase remains only in the existing request authentication/control-plane path. When it is unset, Web temporarily falls back to the existing Supabase database for a reversible migration.

Run the local application with the owned Web database environment:

```bash
npm run dev:web
```

There is no Vercel Cron dependency. The standalone crawler claims work directly from PostgreSQL and runs on any Node 20+ machine.

Install the pinned local semantic model once on each worker host:

```bash
npm run web:model:install
```

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
npm run web:browser:install
npm run web:browser:status
npm run web:embedding:install
npm run web:embedding:status
```

The default `owned` profile uses `CENCORI_WEB_DATABASE_URL` from `.env.web.local`. During the temporary production fallback, install a second worker that explicitly targets the Supabase corpus:

```bash
npm run web:worker:production:install
npm run web:worker:production:status
```

The services are independent:

- `com.cencori.web-crawler` writes to owned PostgreSQL.
- `com.cencori.web-crawler-production` writes to the temporary Supabase production corpus.
- `com.cencori.web-browser` executes owned-database browser jobs.
- `com.cencori.web-browser-production` executes temporary Supabase production browser jobs.
- `com.cencori.web-embedding` serves short-lived query embeddings from owned PostgreSQL.
- `com.cencori.web-embedding-production` serves production query embeddings through the temporary Supabase queue.

The production profile stores only `CENCORI_WEB_STORE=supabase` in its plist. It reads the existing Supabase credentials from `.env.local`; no credentials are copied into the service definition.

The generated service contains no credentials. It starts the repository's built worker, which loads secrets from `.env.local`, and writes logs under `~/Library/Logs/Cencori/`. To stop and remove it:

```bash
npm run web:worker:uninstall
npm run web:worker:production:uninstall
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

Preview or enqueue the curated first-party corpus manifest:

```bash
npm run web:corpus:plan
npm run web:corpus:seed
```

From a trusted crawler host with the Supabase service-role environment:

```bash
npm run web:seed -- --max-pages=250 --max-frontier=5000 --max-depth=2 https://docs.example.com/
```

This is the preferred path for the standalone worker deployment. Alternatively, use the protected internal API:

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

The trusted-host query command tests the owned index directly:

```bash
npm run web:query -- --domain=cencori.com --limit=5 "AI gateway"
```

Run the repeatable quality suite after enough of the manifest has completed:

```bash
npm run web:eval
npm run web:eval -- --minimum-mrr=0.70
```
