/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    assertSafeOutboundUrl,
    isPrivateOrReservedAddress,
    safeOutboundFetch,
} from '@/lib/security/outbound-url';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('outbound URL security', () => {
    it.each([
        '127.0.0.1',
        '10.0.0.1',
        '169.254.169.254',
        '172.16.0.1',
        '192.168.1.1',
        '::1',
        'fc00::1',
        'fe80::1',
        '::ffff:127.0.0.1',
    ])('classifies %s as private or reserved', address => {
        expect(isPrivateOrReservedAddress(address)).toBe(true);
    });

    it.each([
        'http://localhost/admin',
        'http://127.0.0.1/admin',
        'http://169.254.169.254/latest/meta-data',
        'http://[::1]/admin',
        'file:///etc/passwd',
        'https://user:password@example.com/',
    ])('rejects unsafe destination %s', async value => {
        await expect(assertSafeOutboundUrl(value)).rejects.toThrow();
    });

    it('revalidates and exposes every redirect before following it', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {
                status: 302,
                headers: { location: 'https://93.184.216.35/final' },
            }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const onRedirect = vi.fn();

        const response = await safeOutboundFetch('https://93.184.216.34/start', {}, {
            maxRedirects: 1,
            onRedirect,
        });

        expect(response.status).toBe(200);
        expect(onRedirect).toHaveBeenCalledWith(new URL('https://93.184.216.35/final'), 302);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
