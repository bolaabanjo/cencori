/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rewrite = { source: string; destination: string };

describe('public Gateway route contract', () => {
    const config = JSON.parse(
        readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { rewrites: Rewrite[] };

    it('exposes the dependency-free health check through the public /v1 namespace', () => {
        expect(config.rewrites).toContainEqual({
            source: '/v1/health',
            destination: '/api/v1/health',
        });
    });

    it('routes the complete Sessions API through the public /v1 namespace', () => {
        expect(config.rewrites).toEqual(expect.arrayContaining([
            { source: '/v1/sessions', destination: '/api/v1/sessions' },
            { source: '/v1/sessions/:path*', destination: '/api/v1/sessions/:path*' },
        ]));
    });

    it('does not route text completions to the chat-only legacy handler', () => {
        expect(config.rewrites).not.toContainEqual({
            source: '/v1/completions',
            destination: '/api/ai/chat',
        });
    });
});
