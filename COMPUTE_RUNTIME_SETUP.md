# Cencori Compute — Runtime Setup (Fly Machines)

The deploy pipeline is **env-gated**. With no Fly token it uses `localProvider`
(mock: deploys complete to `active` with a `*.fly.dev`-style URL — the whole
loop is testable, boots nothing, costs nothing). Set `FLY_API_TOKEN` and it
switches to real Fly machines. Nothing else changes.

## What runs where

- **Deploy API** (Vercel) — resolves the commit, mints a short-lived clone
  token + a project-scoped `CENCORI_API_KEY`, and creates a Fly app + machine.
  No Docker build happens here.
- **Base image** (`compute/runtime/`) — one prebaked, **self-building** image:
  at boot it clones the repo@commit, runs `arcie build`, and serves the Runtime
  Contract on `$PORT`. (Cold starts rebuild; v1 will cache/snapshot.)

## One-time setup (≈10 min)

1. **Account + CLI**
   ```sh
   # sign up at fly.io (add a card — pay-as-you-go), then:
   brew install flyctl        # or: curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Org API token** → this is `FLY_API_TOKEN`
   ```sh
   fly tokens create org       # copy the token
   ```

3. **Push the base image**
   ```sh
   fly auth docker
   docker build -t registry.fly.io/cencori-arcie-runtime:latest compute/runtime
   docker push  registry.fly.io/cencori-arcie-runtime:latest
   ```

4. **Set env** (Vercel project / `.env`)
   ```sh
   FLY_API_TOKEN=<from step 2>
   FLY_ORG=personal                 # or your Fly org slug
   FLY_REGION=iad                   # default machine region
   FLY_RUNTIME_IMAGE=registry.fly.io/cencori-arcie-runtime:latest
   # optional: FLY_API_HOST=https://api.machines.dev
   ```

That's it — the next deploy boots a real machine and the agent is live at
`https://<slug>-<id>.fly.dev`.

## Cost (testing)

Machines **scale to zero** — you pay only while serving a request. A
`shared-cpu-1x` / 512 MB machine is ~\$2/mo *if it ran 24/7*; idle = \$0.
Testing a few agents ≈ pennies. (A card is required; confirm at fly.io/pricing.)

## Custom domain (later)

v0 uses Fly's free `*.fly.dev`. To move to `*.cencori.app`:
register the domain → wildcard DNS + TLS → submit to the Public Suffix List →
add the domain as a Fly cert per app (or front with a proxy) → set the agent's
`hostname` to `<slug>-<id>.cencori.app`. Not required to go live.

## Notes / v0 limitations

- **Serverless lifecycle** — `buildAndDeploy` is fire-and-forget after the API
  responds. On `next dev` it completes; on Vercel wrap it with `after()` / a
  queue so it survives the request. (Tracked in COMPUTE_ARCHITECTURE.md §8.)
- **Shared IP** — the provider requests a `shared_v4` on app create; if your
  Fly stack needs it explicitly, run `fly ips allocate-v4 --shared -a <app>` once.
- **Key hygiene** — each real deploy mints a fresh `CENCORI_API_KEY`; revoke
  superseded keys on cutover (v1).
