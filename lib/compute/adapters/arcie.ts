/**
 * @cencori/adapter-arcie — the reference native adapter.
 *
 * Detects an Arcie agent (the `arcie` dependency + an `agent/` dir) and emits a
 * build plan: `arcie build` → `.arcie/server.mjs` serving the Runtime Contract.
 * The template every other native adapter follows.
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';

interface PkgJson {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    main?: string;
}

const clean = (v?: string) => (v ? v.replace(/^[\^~>=<\s]+/, '') : undefined);

/** package-lock.json → npm, pnpm-lock.yaml → pnpm, yarn.lock → yarn, bun.lockb → bun. */
async function detectPackageManager(ctx: DetectionContext): Promise<{ pm: string; install: string }> {
    if (await ctx.exists('pnpm-lock.yaml')) return { pm: 'pnpm', install: 'pnpm install --frozen-lockfile' };
    if (await ctx.exists('yarn.lock')) return { pm: 'yarn', install: 'yarn install --frozen-lockfile' };
    if (await ctx.exists('bun.lockb')) return { pm: 'bun', install: 'bun install' };
    if (await ctx.exists('package-lock.json')) return { pm: 'npm', install: 'npm ci' };
    return { pm: 'npm', install: 'npm install' };
}

export const arcieAdapter = defineAdapter({
    name: '@cencori/adapter-arcie',
    displayName: 'Arcie',
    compatibility: 'native',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const pkg = await ctx.json<PkgJson>('package.json');
        if (!pkg) return { confidence: 0, evidence: [] };

        const dep = pkg.dependencies?.arcie ?? pkg.devDependencies?.arcie;
        if (!dep) return { confidence: 0, evidence: [] };

        const evidence = [`"arcie" in dependencies (${dep})`];
        let confidence = 0.9;
        if (await ctx.exists('agent/agent.ts')) {
            evidence.push('agent/agent.ts present');
            confidence = 0.97;
        } else if (await ctx.exists('agent')) {
            evidence.push('agent/ directory present');
            confidence = 0.94;
        }
        return { confidence, language: 'node', framework: 'arcie', frameworkVersion: clean(dep), evidence };
    },

    async plan(ctx: DetectionContext, detection: DetectionResult): Promise<AgentBuildPlan> {
        const { pm, install } = await detectPackageManager(ctx);
        return {
            adapter: '@cencori/adapter-arcie',
            adapterVersion: '0.1.0',
            compatibility: 'native',
            language: 'node',
            framework: 'arcie',
            frameworkVersion: detection.frameworkVersion,
            rootDirectory: ctx.rootDir,
            packageManager: pm,
            installCommand: install,
            buildCommand: 'npx arcie build',
            startCommand: 'node .arcie/server.mjs',
            runtime: { baseImage: 'node', languageVersion: '23', port: 8080, healthPath: '/_health' },
            manifest: {
                ...EMPTY_MANIFEST,
                streaming: true,
                humanApprovals: true,
                session: 'persistent',
                models: [], // resolved via the Cencori gateway (no provider keys in the agent)
                requiredSecrets: ['CENCORI_API_KEY'],
                frameworkMeta: { emits: '.arcie/server.mjs', contract: 'v2' },
            },
            confidence: detection.confidence,
        };
    },
});
