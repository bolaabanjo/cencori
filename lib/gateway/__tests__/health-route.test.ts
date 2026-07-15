/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { GET, HEAD, OPTIONS } from '@/app/api/v1/health/route';

describe('public API health route', () => {
    it('returns a dependency-free JSON health response', async () => {
        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
        expect(response.headers.get('x-cencori-health')).toBe('ok');
        expect(body).toMatchObject({
            status: 'ok',
            service: 'cencori-api',
            version: 'v1',
        });
        expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    });

    it('supports lightweight HEAD and preflight probes', async () => {
        const head = await HEAD();
        const options = await OPTIONS();

        expect(head.status).toBe(200);
        expect(await head.text()).toBe('');
        expect(options.status).toBe(204);
        expect(options.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS');
    });
});
