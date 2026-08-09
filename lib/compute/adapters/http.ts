/**
 * @cencori/adapter-http — compatibility layer 3. The repo already runs an HTTP
 * server; we just install, run its start command, and proxy it through Cencori
 * ingress (no shim). Detected from a Procfile or a `start`/`serve` script.
 *
 * Scores above the generic *language* adapters (it's a stronger signal) but
 * below native framework adapters.
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';

interface PkgJson { scripts?: Record<string, string> }

async function findStart(ctx: DetectionContext): Promise<{ start: string; install: string; language: string; evidence: string } | null> {
    // Procfile: `web: <cmd>`
    const proc = await ctx.readFile('Procfile');
    if (proc) {
        const m = proc.match(/^\s*web:\s*(.+)$/m);
        if (m) return { start: m[1].trim(), install: (await ctx.exists('requirements.txt')) ? 'pip install -r requirements.txt' : 'npm ci', language: (await ctx.exists('requirements.txt')) ? 'python' : 'node', evidence: 'Procfile web process' };
    }
    // Node start/serve script
    const pkg = await ctx.json<PkgJson>('package.json');
    const script = pkg?.scripts?.start ?? pkg?.scripts?.serve;
    if (script && /(server|serve|listen|next start|fastify|express|http|uvicorn|gunicorn|hypercorn)/i.test(script)) {
        return { start: 'npm start', install: (await ctx.exists('package-lock.json')) ? 'npm ci' : 'npm install', language: 'node', evidence: `server-like "start" script: ${script}` };
    }
    return null;
}

export const httpAdapter = defineAdapter({
    name: '@cencori/adapter-http',
    displayName: 'HTTP server',
    compatibility: 'http',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const found = await findStart(ctx);
        if (!found) return { confidence: 0, evidence: [] };
        return { confidence: 0.5, language: found.language, evidence: [found.evidence] };
    },

    async plan(ctx: DetectionContext): Promise<AgentBuildPlan> {
        const found = (await findStart(ctx))!;
        return {
            adapter: '@cencori/adapter-http',
            adapterVersion: '0.1.0',
            compatibility: 'http',
            language: found.language,
            rootDirectory: ctx.rootDir,
            installCommand: found.install,
            startCommand: found.start,
            runtime: { baseImage: found.language === 'python' ? 'python' : 'node', port: 8080, healthPath: '/_health' },
            manifest: { ...EMPTY_MANIFEST, streaming: false, requiredSecrets: ['CENCORI_API_KEY'] },
            confidence: 0.5,
            warnings: ['Existing HTTP server — Cencori proxies it. Ensure it listens on $PORT and exposes /_health (or set a health route).'],
        };
    },
});
