/**
 * @cencori/adapter-generic-python — the Python language adapter (compatibility
 * layer 2). Any Python repo can deploy: we install its deps and serve it through
 * the **Cencori Python shim** (baked into the Python base image), which imports
 * a user-confirmed entry point (`module:attr`) and exposes the Runtime Contract.
 *
 * Low confidence so native Python adapters (LangGraph, CrewAI, …) win when they
 * match; this is the catch-all that keeps a plain Python agent deployable.
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';

async function detectPythonPackaging(ctx: DetectionContext): Promise<{ pm: string; install: string } | null> {
    const hasPyproject = await ctx.exists('pyproject.toml');
    if (await ctx.exists('uv.lock')) return { pm: 'uv', install: hasPyproject ? 'uv sync --frozen' : 'uv pip install --system -r requirements.txt' };
    if (await ctx.exists('poetry.lock')) return { pm: 'poetry', install: 'poetry install --no-root' };
    if (await ctx.exists('requirements.txt')) return { pm: 'pip', install: 'pip install -r requirements.txt' };
    if (await ctx.exists('Pipfile')) return { pm: 'pipenv', install: 'pipenv install --deploy' };
    if (hasPyproject) return { pm: 'pip', install: 'pip install .' };
    if (await ctx.exists('setup.py')) return { pm: 'pip', install: 'pip install .' };
    return null;
}

/** Best-effort entry-point guess (module:attr) from common layouts. */
async function guessEntrypoint(ctx: DetectionContext): Promise<string | undefined> {
    const candidates = ['agent.py', 'main.py', 'app.py', 'src/agent.py', 'src/main.py'];
    for (const path of candidates) {
        if (await ctx.exists(path)) {
            const mod = path.replace(/\.py$/, '').replace(/\//g, '.');
            return `${mod}:agent`;
        }
    }
    return undefined;
}

export const genericPythonAdapter = defineAdapter({
    name: '@cencori/adapter-generic-python',
    displayName: 'Python',
    compatibility: 'language',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const packaging = await detectPythonPackaging(ctx);
        if (!packaging) return { confidence: 0, evidence: [] };
        const evidence = [`Python packaging: ${packaging.pm}`];
        const entrypoint = await guessEntrypoint(ctx);
        if (entrypoint) evidence.push(`entry guess: ${entrypoint}`);
        return { confidence: 0.3, language: 'python', entrypoint, evidence };
    },

    async plan(ctx: DetectionContext, detection: DetectionResult): Promise<AgentBuildPlan> {
        const packaging = (await detectPythonPackaging(ctx)) ?? { pm: 'pip', install: 'pip install -r requirements.txt' };
        const entry = detection.entrypoint;
        // pyproject.toml is TOML, not JSON — read it and light-parse requires-python.
        const pyproject = (await ctx.readFile('pyproject.toml')) ?? '';
        const versionMatch = pyproject.match(/requires-python\s*=\s*["']([^"']+)["']/);
        const version = versionMatch ? versionMatch[1].replace(/[^\d.]/g, '') : '3.12';

        return {
            adapter: '@cencori/adapter-generic-python',
            adapterVersion: '0.1.0',
            compatibility: 'language',
            language: 'python',
            rootDirectory: ctx.rootDir,
            packageManager: packaging.pm,
            installCommand: packaging.install,
            // Serve via the baked-in Cencori shim (reads AGENT_ENTRYPOINT).
            startCommand: 'python /opt/cencori/cencori_shim.py',
            entrypoint: entry,
            runtime: { baseImage: 'python', languageVersion: version, port: 8080, healthPath: '/_health' },
            manifest: { ...EMPTY_MANIFEST, requiredSecrets: ['CENCORI_API_KEY'] },
            confidence: detection.confidence,
            warnings: entry ? undefined : ['No entry point found — confirm one (module:attr) so the shim can serve it.'],
        };
    },
});
