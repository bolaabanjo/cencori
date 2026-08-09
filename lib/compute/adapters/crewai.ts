/**
 * @cencori/adapter-crewai — native adapter. Detects CrewAI (Python): crews of
 * role-playing agents + tools. v0 serves via the generic Python shim.
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';
import { pyHasDep, pythonPackaging } from './detect-helpers';

async function guessEntry(ctx: DetectionContext): Promise<string | undefined> {
    for (const p of ['main.py', 'crew.py', 'src/main.py', 'src/crew.py']) {
        if (await ctx.exists(p)) return `${p.replace(/\.py$/, '').replace(/\//g, '.')}:crew`;
    }
    return undefined;
}

export const crewaiAdapter = defineAdapter({
    name: '@cencori/adapter-crewai',
    displayName: 'CrewAI',
    compatibility: 'native',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const dep = await pyHasDep(ctx, ['crewai']);
        if (!dep) return { confidence: 0, evidence: [] };
        const entrypoint = await guessEntry(ctx);
        return { confidence: entrypoint ? 0.93 : 0.9, language: 'python', framework: 'crewai', entrypoint, evidence: ['crewai in Python deps'] };
    },

    async plan(ctx: DetectionContext, detection: DetectionResult): Promise<AgentBuildPlan> {
        const { install } = await pythonPackaging(ctx);
        return {
            adapter: '@cencori/adapter-crewai',
            adapterVersion: '0.1.0',
            compatibility: 'native',
            language: 'python',
            framework: 'crewai',
            rootDirectory: ctx.rootDir,
            installCommand: install,
            startCommand: 'python /opt/cencori/cencori_shim.py',
            entrypoint: detection.entrypoint,
            runtime: { baseImage: 'python', port: 8080, healthPath: '/_health' },
            manifest: {
                ...EMPTY_MANIFEST,
                streaming: true,
                session: 'persistent',
                requiredSecrets: ['CENCORI_API_KEY'],
                frameworkMeta: { topology: 'crew' },
            },
            confidence: detection.confidence,
            warnings: detection.entrypoint ? undefined : ['Confirm the crew entry point (module:attr).'],
        };
    },
});
