/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
    assertSafeOutboundUrl,
    isPrivateOrReservedAddress,
} from '@/lib/security/outbound-url';

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
});
