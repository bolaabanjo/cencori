/**
 * @cencori/adapter-docker — compatibility layer 4, the "every framework"
 * backstop. The repo ships a Dockerfile → the container is the runtime. Cencori
 * builds the image and runs it (the provider builds from the Dockerfile rather
 * than the prebaked base image). Detected from a Dockerfile at the root.
 *
 * Scores below native adapters (they give topology + the best dashboard) but
 * above http/generic — a deliberate Dockerfile is a strong deploy signal.
 */

import { defineAdapter } from './sdk';
import { EMPTY_MANIFEST, type AgentBuildPlan, type DetectionContext, type DetectionResult } from './types';

async function findDockerfile(ctx: DetectionContext): Promise<string | null> {
    if (await ctx.exists('Dockerfile')) return 'Dockerfile';
    if (await ctx.exists('docker/Dockerfile')) return 'docker/Dockerfile';
    return null;
}

/** Best-effort port from EXPOSE. */
async function exposedPort(ctx: DetectionContext, dockerfile: string): Promise<number> {
    const text = (await ctx.readFile(dockerfile)) ?? '';
    const m = text.match(/^\s*EXPOSE\s+(\d+)/im);
    return m ? Number(m[1]) : 8080;
}

export const dockerAdapter = defineAdapter({
    name: '@cencori/adapter-docker',
    displayName: 'Dockerfile',
    compatibility: 'container',

    async detect(ctx: DetectionContext): Promise<DetectionResult> {
        const dockerfile = await findDockerfile(ctx);
        if (!dockerfile) return { confidence: 0, evidence: [] };
        return { confidence: 0.55, evidence: [`${dockerfile} present — container is the runtime`] };
    },

    async plan(ctx: DetectionContext): Promise<AgentBuildPlan> {
        const dockerfile = (await findDockerfile(ctx))!;
        const port = await exposedPort(ctx, dockerfile);
        return {
            adapter: '@cencori/adapter-docker',
            adapterVersion: '0.1.0',
            compatibility: 'container',
            language: 'docker',
            rootDirectory: ctx.rootDir,
            packageManager: 'docker',
            // The provider builds from the Dockerfile — no self-building base image.
            installCommand: '',
            startCommand: `docker:${dockerfile}`,
            entrypoint: dockerfile,
            runtime: { baseImage: 'node', port, healthPath: '/_health' },
            manifest: { ...EMPTY_MANIFEST, requiredSecrets: ['CENCORI_API_KEY'] },
            confidence: 0.55,
            warnings: ['Built from your Dockerfile — ensure it listens on the exposed port and serves /_health.'],
        };
    },
});
