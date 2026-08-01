import { describe, expect, it } from 'vitest';
import { isIpAllowed, isIpInCidr, normalizeCidr, parseIp } from '@/lib/networking/cidr';

describe('project network CIDR matching', () => {
    it('matches IPv4 addresses against network prefixes', () => {
        expect(isIpInCidr('203.0.113.42', '203.0.113.0/24')).toBe(true);
        expect(isIpInCidr('203.0.114.42', '203.0.113.0/24')).toBe(false);
    });

    it('matches exact IPv4 addresses when the prefix is omitted', () => {
        expect(normalizeCidr('198.51.100.8')).toBe('198.51.100.8/32');
        expect(isIpInCidr('198.51.100.8', '198.51.100.8')).toBe(true);
        expect(isIpInCidr('198.51.100.9', '198.51.100.8')).toBe(false);
    });

    it('matches compressed IPv6 prefixes', () => {
        expect(isIpInCidr('2001:db8:1234::9', '2001:db8::/32')).toBe(true);
        expect(isIpInCidr('2001:db9::9', '2001:db8::/32')).toBe(false);
    });

    it('handles IPv4-mapped IPv6 addresses', () => {
        expect(parseIp('::ffff:192.0.2.128')).not.toBeNull();
        expect(isIpInCidr('::ffff:192.0.2.128', '::ffff:192.0.2.0/120')).toBe(true);
    });

    it('rejects invalid prefixes and cross-version comparisons', () => {
        expect(normalizeCidr('10.0.0.1/33')).toBeNull();
        expect(normalizeCidr('2001:db8::/129')).toBeNull();
        expect(isIpInCidr('10.0.0.1', '2001:db8::/32')).toBe(false);
    });

    it('allows a source when any configured range matches', () => {
        expect(isIpAllowed('10.4.8.12', ['192.0.2.0/24', '10.0.0.0/8'])).toBe(true);
        expect(isIpAllowed('172.16.0.1', ['192.0.2.0/24', '10.0.0.0/8'])).toBe(false);
    });
});
