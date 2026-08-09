/**
 * @cencori/adapter-langgraph — native adapter. Detects LangGraph (Python or JS)
 * and normalizes it: graphs → topology, interrupts → suspended runs, checkpoints
 * → persistent sessions. v0 serves Python via the generic shim (a framework-aware
 * shim that speaks the run lifecycle lands with the contract v2 rollout).
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';
import { langgraphEntry, langgraphEntryNode, nodeHasDep, nodePackageManager, pyHasDep, pythonPackaging } from './detect-helpers';

export const langgraphAdapter = defineAdapter({
    name: '@cencori/adapter-langgraph',
    displayName: 'LangGraph',
    compatibility: 'native',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const py = await pyHasDep(ctx, ['langgraph']);
        if (py) {
            const entrypoint = await langgraphEntry(ctx);
            const evidence = ['langgraph in Python deps'];
            if (entrypoint) evidence.push(`langgraph.json → ${entrypoint}`);
            return { confidence: entrypoint ? 0.95 : 0.9, language: 'python', framework: 'langgraph', entrypoint, evidence };
        }
        const node = await nodeHasDep(ctx, ['@langchain/langgraph']);
        if (node) {
            const entrypoint = await langgraphEntryNode(ctx);
            return { confidence: entrypoint ? 0.95 : 0.9, language: 'node', framework: 'langgraph', frameworkVersion: node.version, entrypoint, evidence: ['@langchain/langgraph in deps'] };
        }
        return { confidence: 0, evidence: [] };
    },

    async plan(ctx: DetectionContext, detection: DetectionResult): Promise<AgentBuildPlan> {
        const isPython = detection.language === 'python';
        const { install } = isPython ? await pythonPackaging(ctx) : await nodePackageManager(ctx);
        return {
            adapter: '@cencori/adapter-langgraph',
            adapterVersion: '0.1.0',
            compatibility: 'native',
            language: detection.language ?? 'python',
            framework: 'langgraph',
            frameworkVersion: detection.frameworkVersion,
            rootDirectory: ctx.rootDir,
            installCommand: install,
            startCommand: isPython ? 'python /opt/cencori/cencori_shim.py' : 'node /opt/cencori/cencori-shim.mjs',
            entrypoint: detection.entrypoint,
            runtime: { baseImage: isPython ? 'python' : 'node', port: 8080, healthPath: '/_health' },
            manifest: {
                ...EMPTY_MANIFEST,
                streaming: true,
                humanApprovals: true, // LangGraph interrupts → suspended runs
                session: 'persistent',
                memory: { kind: 'checkpoint' },
                requiredSecrets: ['CENCORI_API_KEY'],
                frameworkMeta: { interrupts: 'suspend', checkpointer: true },
            },
            confidence: detection.confidence,
            warnings: detection.entrypoint ? undefined : ['Add a langgraph.json (graphs) or confirm an entry point (file:export).'],
        };
    },
});
