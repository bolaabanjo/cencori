/**
 * Shared, non-executing detection helpers used by the native adapters —
 * dependency lookups + package-manager/install resolution for Node and Python.
 */

import type { DetectionContext } from './types';

const cleanVer = (v?: string) => (v ? v.replace(/^[\^~>=<\s]+/, '') : undefined);

/** Find the first of `names` present in package.json deps/devDeps. */
export async function nodeHasDep(ctx: DetectionContext, names: string[]): Promise<{ found: string; version?: string } | null> {
    const pkg = await ctx.json<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>('package.json');
    if (!pkg) return null;
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const name of names) {
        if (all[name]) return { found: name, version: cleanVer(all[name]) };
    }
    return null;
}

/** Find the first of `names` in requirements.txt / pyproject.toml (as a dep token). */
export async function pyHasDep(ctx: DetectionContext, names: string[]): Promise<{ found: string } | null> {
    const req = (await ctx.readFile('requirements.txt')) ?? '';
    const pyproject = (await ctx.readFile('pyproject.toml')) ?? '';
    const hay = `${req}\n${pyproject}`.toLowerCase();
    for (const name of names) {
        const esc = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // dep boundary: start/quote/bracket/space before, and separator/EOL after
        if (new RegExp(`(^|[\\s"'\\[])${esc}([\\s"'=<>~!,\\]]|$)`, 'm').test(hay)) {
            return { found: name };
        }
    }
    return null;
}

export async function nodePackageManager(ctx: DetectionContext): Promise<{ pm: string; install: string }> {
    if (await ctx.exists('pnpm-lock.yaml')) return { pm: 'pnpm', install: 'pnpm install --frozen-lockfile' };
    if (await ctx.exists('yarn.lock')) return { pm: 'yarn', install: 'yarn install --frozen-lockfile' };
    if (await ctx.exists('bun.lockb')) return { pm: 'bun', install: 'bun install' };
    if (await ctx.exists('package-lock.json')) return { pm: 'npm', install: 'npm ci' };
    return { pm: 'npm', install: 'npm install' };
}

export async function pythonPackaging(ctx: DetectionContext): Promise<{ pm: string; install: string }> {
    if (await ctx.exists('uv.lock')) return { pm: 'uv', install: (await ctx.exists('pyproject.toml')) ? 'uv sync --frozen' : 'uv pip install --system -r requirements.txt' };
    if (await ctx.exists('poetry.lock')) return { pm: 'poetry', install: 'poetry install --no-root' };
    if (await ctx.exists('requirements.txt')) return { pm: 'pip', install: 'pip install -r requirements.txt' };
    if (await ctx.exists('pyproject.toml')) return { pm: 'pip', install: 'pip install .' };
    return { pm: 'pip', install: 'pip install -r requirements.txt' };
}

/** LangGraph `langgraph.json` graph entry → Python `module:attr` for the shim. */
export async function langgraphEntry(ctx: DetectionContext): Promise<string | undefined> {
    const cfg = await ctx.json<{ graphs?: Record<string, string> }>('langgraph.json');
    const first = cfg?.graphs ? Object.values(cfg.graphs)[0] : undefined;
    if (!first) return undefined;
    // "./src/agent.py:graph" → "src.agent:graph"
    const [file, attr] = first.split(':');
    const mod = file.replace(/^\.?\//, '').replace(/\.py$/, '').replace(/\//g, '.');
    return attr ? `${mod}:${attr}` : mod;
}

/** LangGraph entry for Node — keep the file path (Node imports it directly). */
export async function langgraphEntryNode(ctx: DetectionContext): Promise<string | undefined> {
    const cfg = await ctx.json<{ graphs?: Record<string, string> }>('langgraph.json');
    const first = cfg?.graphs ? Object.values(cfg.graphs)[0] : undefined;
    return first ? first.replace(/^\.?\//, '') : undefined; // "./src/agent.ts:graph" → "src/agent.ts:graph"
}

/** Guess a Node entry file that exports the agent (with an optional export name). */
export async function guessNodeEntry(ctx: DetectionContext, exportName?: string): Promise<string | undefined> {
    const pkg = await ctx.json<{ main?: string }>('package.json');
    const candidates = [pkg?.main, 'agent.ts', 'agent.js', 'src/agent.ts', 'src/agent.js', 'src/mastra/index.ts', 'src/index.ts', 'index.ts', 'index.js'].filter(Boolean) as string[];
    for (const file of candidates) {
        if (await ctx.exists(file)) return exportName ? `${file}:${exportName}` : file;
    }
    return undefined;
}
