/**
 * @cencori/adapter-mastra — native adapter for Mastra (TS agent framework).
 * Detects `@mastra/core`. v0 builds + starts the app; a Node shim that speaks
 * the run lifecycle lands with the contract v2 rollout.
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';
import { guessNodeEntry, nodeHasDep, nodePackageManager } from './detect-helpers';

export const mastraAdapter = defineAdapter({
    name: '@cencori/adapter-mastra',
    displayName: 'Mastra',
    compatibility: 'native',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const dep = await nodeHasDep(ctx, ['@mastra/core', 'mastra']);
        if (!dep) return { confidence: 0, evidence: [] };
        const entrypoint = await guessNodeEntry(ctx, 'agent');
        return { confidence: 0.9, language: 'node', framework: 'mastra', frameworkVersion: dep.version, entrypoint, evidence: [`${dep.found} in deps`] };
    },

    async plan(ctx: DetectionContext, detection: DetectionResult): Promise<AgentBuildPlan> {
        const { pm, install } = await nodePackageManager(ctx);
        return {
            adapter: '@cencori/adapter-mastra',
            adapterVersion: '0.1.0',
            compatibility: 'native',
            language: 'node',
            framework: 'mastra',
            frameworkVersion: detection.frameworkVersion,
            rootDirectory: ctx.rootDir,
            packageManager: pm,
            installCommand: install,
            // The shim imports the exported Mastra agent and calls .generate().
            startCommand: 'node /opt/cencori/cencori-shim.mjs',
            entrypoint: detection.entrypoint,
            runtime: { baseImage: 'node', languageVersion: '23', port: 8080, healthPath: '/_health' },
            manifest: { ...EMPTY_MANIFEST, streaming: true, session: 'persistent', requiredSecrets: ['CENCORI_API_KEY'] },
            confidence: detection.confidence,
            warnings: detection.entrypoint ? undefined : ['Export a Mastra agent from an entry file (file:agent) for the shim.'],
        };
    },
});
