/**
 * Cencori Compute — runtime provider abstraction.
 *
 * v0 wraps a managed container provider (Fly Machines). The rest of the
 * platform depends only on this interface, so v2 can swap in a first-party
 * isolate runtime without touching the build pipeline or the API.
 *
 * Provider selection is env-gated (see getRuntimeProvider):
 *   - `flyProvider`   when FLY_API_TOKEN is set → boots real machines.
 *   - `localProvider` otherwise → mock: the deploy loop completes end-to-end
 *     (building → active + a URL) with no infra, for local/preview testing.
 *
 * See COMPUTE_ARCHITECTURE.md §9 and COMPUTE_RUNTIME_SETUP.md.
 */

/**
 * Container compatibility layer: build the machine's image from the repo's own
 * Dockerfile instead of booting a prebaked base image. When a DeployMachineOptions
 * carries a `build` spec, the provider builds+pushes this image first, then runs it.
 */
export interface DockerBuildSpec {
    /** "owner/repo". */
    repoFullName: string;
    /** Commit SHA to build (pins the image to the deployed commit). */
    ref: string;
    /** Dockerfile path within the repo, e.g. "Dockerfile" or "docker/Dockerfile". */
    dockerfile: string;
    /** Build-context root within the repo (usually the repo root). */
    rootDir: string;
    /** Clone credential — real providers only; never logged. */
    githubToken?: string;
}

export interface DeployMachineOptions {
    /** Stable identifier for the agent (used for app/machine naming + routing). */
    agentSlug: string;
    /**
     * Base runtime image the machine boots (the self-building arcie runtime).
     * Ignored when `build` is set — the provider builds the image from the repo's
     * Dockerfile and runs that instead.
     */
    imageRef: string;
    /** Env injected into the container ($CENCORI_API_KEY, repo, commit, PORT, …). */
    env: Record<string, string>;
    /** Container layer: build from the repo's Dockerfile rather than `imageRef`. */
    build?: DockerBuildSpec;
    region?: string;
    /** Memory in MB (billing tier). */
    memoryMb?: number;
}

export interface DeployedMachine {
    machineId: string;
    /** Public URL the agent is reachable at (ingress routes /invoke etc. here). */
    url: string;
}

export type MachineStatus = 'starting' | 'running' | 'stopped' | 'failed';

export interface RuntimeProvider {
    readonly name: string;
    deploy(opts: DeployMachineOptions): Promise<DeployedMachine>;
    stop(machineId: string): Promise<void>;
    status(machineId: string): Promise<MachineStatus>;
}

// A short, url-safe id fragment for hostnames / app names.
function shortId(): string {
    return Math.random().toString(36).slice(2, 8);
}

// ── Local / mock provider ────────────────────────────────────────────────
// No infra. Completes the deploy loop so the whole product flow is testable
// today: returns a plausible *.fly.dev-style URL after a short "build" pause.
export const localProvider: RuntimeProvider = {
    name: 'local',
    async deploy(opts: DeployMachineOptions): Promise<DeployedMachine> {
        if (opts.build) {
            // Simulate a Dockerfile image build (slower than booting a base image).
            console.log(`[local] mock docker build ${opts.build.repoFullName}@${opts.build.ref.slice(0, 7)} (${opts.build.dockerfile})`);
            await new Promise((r) => setTimeout(r, 4000));
        } else {
            // Simulate build/boot time so the UI shows "Building" briefly.
            await new Promise((r) => setTimeout(r, 2500));
        }
        const app = `${opts.agentSlug}-${shortId()}`;
        return { machineId: `local_${shortId()}`, url: `https://${app}.fly.dev` };
    },
    async stop(): Promise<void> {
        /* no-op */
    },
    async status(): Promise<MachineStatus> {
        return 'running';
    },
};

// ── Fly Machines provider ────────────────────────────────────────────────
// One Fly app per agent → the agent's public URL is `<app>.fly.dev`. Requires
// FLY_API_TOKEN (+ FLY_ORG). See COMPUTE_RUNTIME_SETUP.md for the one-time
// setup (create org token, push the base image, allocate shared IPs).
const FLY_API = process.env.FLY_API_HOST || 'https://api.machines.dev';

async function flyFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${FLY_API}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${process.env.FLY_API_TOKEN}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    });
}

/**
 * Build an image from the repo's Dockerfile and return a runnable registry ref.
 *
 * Fly builds Dockerfiles with a remote builder (a depot/fly-builder machine that
 * flyctl orchestrates over the GraphQL API), then pushes to `registry.fly.io/<app>`.
 * The Machines REST API alone can't build — so this is the integration boundary:
 * until the remote builder is provisioned (same milestone as pushing the base
 * images), the container layer can't build on Fly. Local/mock mode covers the
 * end-to-end product flow in the meantime.
 */
async function flyBuildFromDockerfile(appName: string, build: DockerBuildSpec): Promise<string> {
    void appName;
    void build;
    throw new Error(
        '[fly] Dockerfile builds require the Fly remote builder (not yet provisioned). ' +
            'Docker-deploy runs end-to-end in local/mock mode; wire the remote builder to ship it on Fly. See COMPUTE_RUNTIME_SETUP.md.',
    );
}

export const flyProvider: RuntimeProvider = {
    name: 'fly',

    async deploy(opts: DeployMachineOptions): Promise<DeployedMachine> {
        const org = process.env.FLY_ORG || 'personal';
        const appName = `${opts.agentSlug}-${shortId()}`.toLowerCase().slice(0, 60);

        // 1. Create the app (one per agent).
        const createApp = await flyFetch('/v1/apps', {
            method: 'POST',
            body: JSON.stringify({ app_name: appName, org_slug: org }),
        });
        if (!createApp.ok && createApp.status !== 409) {
            throw new Error(`[fly] create app failed (${createApp.status}): ${await createApp.text()}`);
        }

        // 2. Allocate a shared IPv4 so `<app>.fly.dev` routes publicly (free).
        //    On some stacks this is a one-time `fly ips allocate-v4 --shared -a <app>`.
        await flyFetch(`/v1/apps/${appName}/ip_addresses`, {
            method: 'POST',
            body: JSON.stringify({ type: 'shared_v4' }),
        }).catch(() => undefined);

        // Container layer: build the repo's Dockerfile into the image we run.
        // Otherwise boot the prebaked self-building base image (`opts.imageRef`).
        const image = opts.build ? await flyBuildFromDockerfile(appName, opts.build) : opts.imageRef;

        // 3. Create the machine, exposing $PORT on 80/443.
        const port = Number(opts.env.PORT || '8080');
        const createMachine = await flyFetch(`/v1/apps/${appName}/machines`, {
            method: 'POST',
            body: JSON.stringify({
                region: opts.region || process.env.FLY_REGION || 'iad',
                config: {
                    image,
                    env: opts.env,
                    guest: { cpu_kind: 'shared', cpus: 1, memory_mb: opts.memoryMb || 512 },
                    // Scale-to-zero: stop when idle, auto-start on request.
                    services: [
                        {
                            protocol: 'tcp',
                            internal_port: port,
                            autostop: 'stop',
                            autostart: true,
                            min_machines_running: 0,
                            ports: [
                                { port: 443, handlers: ['tls', 'http'] },
                                { port: 80, handlers: ['http'], force_https: true },
                            ],
                        },
                    ],
                    checks: {
                        health: { type: 'http', port, method: 'get', path: '/_health', interval: '15s', timeout: '10s', grace_period: '30s' },
                    },
                },
            }),
        });
        if (!createMachine.ok) {
            throw new Error(`[fly] create machine failed (${createMachine.status}): ${await createMachine.text()}`);
        }
        const machine = (await createMachine.json()) as { id: string };
        return { machineId: machine.id, url: `https://${appName}.fly.dev` };
    },

    async stop(machineId: string): Promise<void> {
        await flyFetch(`/v1/apps/${process.env.FLY_APP || ''}/machines/${machineId}/stop`, { method: 'POST' }).catch(() => undefined);
    },

    async status(): Promise<MachineStatus> {
        return 'running';
    },
};

export function getRuntimeProvider(): RuntimeProvider {
    return process.env.FLY_API_TOKEN ? flyProvider : localProvider;
}
