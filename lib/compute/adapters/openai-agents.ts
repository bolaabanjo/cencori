/**
 * @cencori/adapter-openai-agents — native adapter for the OpenAI Agents SDK
 * (Python `openai-agents` or JS `@openai/agents`). Handoffs normalize to
 * suspended runs. v0 serves Python via the generic shim; JS via `npm start`.
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';
import { guessNodeEntry, nodeHasDep, nodePackageManager, pyHasDep, pythonPackaging } from './detect-helpers';

export const openaiAgentsAdapter = defineAdapter({
    name: '@cencori/adapter-openai-agents',
    displayName: 'OpenAI Agents SDK',
    compatibility: 'native',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const py = await pyHasDep(ctx, ['openai-agents']);
        if (py) return { confidence: 0.9, language: 'python', framework: 'openai-agents', evidence: ['openai-agents in Python deps'] };
        const node = await nodeHasDep(ctx, ['@openai/agents']);
        if (node) {
            const entrypoint = await guessNodeEntry(ctx, 'agent');
            return { confidence: 0.9, language: 'node', framework: 'openai-agents', frameworkVersion: node.version, entrypoint, evidence: ['@openai/agents in deps'] };
        }
        return { confidence: 0, evidence: [] };
    },

    async plan(ctx: DetectionContext, detection: DetectionResult): Promise<AgentBuildPlan> {
        const isPython = detection.language === 'python';
        const { install } = isPython ? await pythonPackaging(ctx) : await nodePackageManager(ctx);
        return {
            adapter: '@cencori/adapter-openai-agents',
            adapterVersion: '0.1.0',
            compatibility: 'native',
            language: detection.language ?? 'python',
            framework: 'openai-agents',
            frameworkVersion: detection.frameworkVersion,
            rootDirectory: ctx.rootDir,
            installCommand: install,
            startCommand: isPython ? 'python /opt/cencori/cencori_shim.py' : 'node /opt/cencori/cencori-shim.mjs',
            entrypoint: detection.entrypoint,
            runtime: { baseImage: isPython ? 'python' : 'node', port: 8080, healthPath: '/_health' },
            manifest: {
                ...EMPTY_MANIFEST,
                streaming: true,
                humanApprovals: true, // handoffs → suspended runs
                session: 'persistent',
                requiredSecrets: ['CENCORI_API_KEY'],
                frameworkMeta: { handoffs: 'suspend' },
            },
            confidence: detection.confidence,
            warnings: detection.entrypoint
                ? undefined
                : [isPython ? 'Confirm the agent entry point (module:attr).' : 'Export the agent from an entry file (file:agent) — the shim runs it via the SDK.'],
        };
    },
});
