/**
 * @cencori/adapter-vercel-eve — native adapter for Vercel's eve agent framework.
 *
 * NOTE: the package identifier is provisional — confirm eve's real npm name and
 * update `EVE_PACKAGES`. Until then eve repos still deploy via generic-node / http.
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';
import { guessNodeEntry, nodeHasDep, nodePackageManager } from './detect-helpers';

const EVE_PACKAGES = ['eve', '@vercel/eve']; // provisional — verify

export const vercelEveAdapter = defineAdapter({
    name: '@cencori/adapter-vercel-eve',
    displayName: 'eve',
    compatibility: 'native',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const dep = await nodeHasDep(ctx, EVE_PACKAGES);
        if (!dep) return { confidence: 0, evidence: [] };
        const entrypoint = await guessNodeEntry(ctx, 'agent');
        return { confidence: 0.9, language: 'node', framework: 'vercel-eve', frameworkVersion: dep.version, entrypoint, evidence: [`${dep.found} in deps`] };
    },

    async plan(ctx: DetectionContext, detection: DetectionResult): Promise<AgentBuildPlan> {
        const { pm, install } = await nodePackageManager(ctx);
        return {
            adapter: '@cencori/adapter-vercel-eve',
            adapterVersion: '0.1.0',
            compatibility: 'native',
            language: 'node',
            framework: 'vercel-eve',
            frameworkVersion: detection.frameworkVersion,
            rootDirectory: ctx.rootDir,
            packageManager: pm,
            installCommand: install,
            startCommand: 'node /opt/cencori/cencori-shim.mjs',
            entrypoint: detection.entrypoint,
            runtime: { baseImage: 'node', languageVersion: '23', port: 8080, healthPath: '/_health' },
            manifest: { ...EMPTY_MANIFEST, streaming: true, session: 'persistent', requiredSecrets: ['CENCORI_API_KEY'] },
            confidence: detection.confidence,
            warnings: ['eve adapter is provisional — verify the package name and that the entry exports an agent for the shim.'],
        };
    },
});
