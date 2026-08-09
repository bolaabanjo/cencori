/**
 * @cencori/adapter-generic-node — the Node language adapter (compatibility
 * layer 2). Any Node repo that isn't already a server (that's the http adapter)
 * deploys as an agent module: we install deps and serve it through the **Cencori
 * Node shim** (baked into the base image), which imports the module named by
 * AGENT_ENTRYPOINT and exposes the Runtime Contract.
 *
 * Low detection confidence so native adapters (Arcie, Mastra, …) win when they
 * match; this is the catch-all that keeps a plain Node agent deployable.
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';

interface PkgJson { main?: string }

/** Best-effort entry file (the shim resolves default/agent export). */
async function guessEntry(ctx: DetectionContext, pkg: PkgJson | null): Promise<string | undefined> {
    if (pkg?.main && (await ctx.exists(pkg.main))) return pkg.main;
    for (const path of ['agent.ts', 'agent.js', 'src/agent.ts', 'src/agent.js', 'index.ts', 'index.js', 'src/index.ts', 'src/index.js']) {
        if (await ctx.exists(path)) return path;
    }
    return pkg?.main;
}

export const genericNodeAdapter = defineAdapter({
    name: '@cencori/adapter-generic-node',
    displayName: 'Node.js',
    compatibility: 'language',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const pkg = await ctx.json<PkgJson>('package.json');
        if (!pkg) return { confidence: 0, evidence: [] };
        const entrypoint = await guessEntry(ctx, pkg);
        const evidence = ['package.json present'];
        if (entrypoint) evidence.push(`entry: ${entrypoint}`);
        return { confidence: 0.3, language: 'node', entrypoint, evidence };
    },

    async plan(ctx: DetectionContext, detection: DetectionResult): Promise<AgentBuildPlan> {
        const install = (await ctx.exists('package-lock.json')) ? 'npm ci' : 'npm install';
        return {
            adapter: '@cencori/adapter-generic-node',
            adapterVersion: '0.1.0',
            compatibility: 'language',
            language: 'node',
            rootDirectory: ctx.rootDir,
            packageManager: 'npm',
            installCommand: install,
            // Serve via the baked-in Cencori Node shim (reads AGENT_ENTRYPOINT).
            startCommand: 'node /opt/cencori/cencori-shim.mjs',
            entrypoint: detection.entrypoint,
            runtime: { baseImage: 'node', languageVersion: '23', port: 8080, healthPath: '/_health' },
            manifest: { ...EMPTY_MANIFEST, requiredSecrets: ['CENCORI_API_KEY'] },
            confidence: detection.confidence,
            warnings: detection.entrypoint
                ? undefined
                : ['No entry module found — confirm one (file[:export]) that exports the agent.'],
        };
    },
});
