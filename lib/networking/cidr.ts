import { isIP } from 'node:net';

export type IpVersion = 4 | 6;

interface ParsedIp {
    version: IpVersion;
    value: bigint;
}

function stripAddressDecorations(input: string): string {
    const value = input.trim();

    if (value.startsWith('[')) {
        const closingBracket = value.indexOf(']');
        return closingBracket === -1 ? value : value.slice(1, closingBracket);
    }

    const ipv4WithPort = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort) return ipv4WithPort[1];

    return value.split('%')[0];
}

function parseIpv4(address: string): bigint | null {
    if (isIP(address) !== 4) return null;

    return address.split('.').reduce(
        (result, segment) => (result << BigInt(8)) | BigInt(Number(segment)),
        BigInt(0)
    );
}

function expandIpv6(address: string): string[] | null {
    let normalized = address.toLowerCase();

    if (normalized.includes('.')) {
        const lastColon = normalized.lastIndexOf(':');
        const ipv4 = normalized.slice(lastColon + 1);
        const ipv4Value = parseIpv4(ipv4);
        if (ipv4Value === null) return null;

        const high = Number((ipv4Value >> BigInt(16)) & BigInt(0xffff)).toString(16);
        const low = Number(ipv4Value & BigInt(0xffff)).toString(16);
        normalized = `${normalized.slice(0, lastColon)}:${high}:${low}`;
    }

    if (isIP(normalized) !== 6) return null;

    const compressionParts = normalized.split('::');
    if (compressionParts.length > 2) return null;

    const left = compressionParts[0] ? compressionParts[0].split(':') : [];
    const right = compressionParts[1] ? compressionParts[1].split(':') : [];
    const missing = 8 - left.length - right.length;

    if (missing < 0 || (compressionParts.length === 1 && missing !== 0)) return null;
    return [...left, ...Array(missing).fill('0'), ...right];
}

function parseIpv6(address: string): bigint | null {
    const segments = expandIpv6(address);
    if (!segments || segments.length !== 8) return null;

    return segments.reduce(
        (result, segment) => (result << BigInt(16)) | BigInt(parseInt(segment, 16)),
        BigInt(0)
    );
}

export function parseIp(input: string): ParsedIp | null {
    const address = stripAddressDecorations(input);
    const version = isIP(address);

    if (version === 4) {
        const value = parseIpv4(address);
        return value === null ? null : { version: 4, value };
    }

    if (version === 6) {
        const value = parseIpv6(address);
        return value === null ? null : { version: 6, value };
    }

    return null;
}

export function normalizeCidr(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const [rawAddress, rawPrefix, ...extra] = trimmed.split('/');
    if (extra.length > 0) return null;

    const parsed = parseIp(rawAddress);
    if (!parsed) return null;

    const maxPrefix = parsed.version === 4 ? 32 : 128;
    const prefix = rawPrefix === undefined ? maxPrefix : Number(rawPrefix);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null;

    return `${stripAddressDecorations(rawAddress).toLowerCase()}/${prefix}`;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
    const normalizedCidr = normalizeCidr(cidr);
    const parsedIp = parseIp(ip);
    if (!normalizedCidr || !parsedIp) return false;

    const [networkAddress, rawPrefix] = normalizedCidr.split('/');
    const parsedNetwork = parseIp(networkAddress);
    if (!parsedNetwork || parsedNetwork.version !== parsedIp.version) return false;

    const totalBits = parsedIp.version === 4 ? 32 : 128;
    const prefix = Number(rawPrefix);
    if (prefix === 0) return true;

    const shift = BigInt(totalBits - prefix);
    return (parsedIp.value >> shift) === (parsedNetwork.value >> shift);
}

export function isIpAllowed(ip: string, allowedCidrs: string[]): boolean {
    return allowedCidrs.some((cidr) => isIpInCidr(ip, cidr));
}
