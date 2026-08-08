import { safeOutboundFetch, readResponseBuffer } from '@/lib/security/outbound-url';
import { WebRuntimeError } from './errors';

const USER_AGENT = 'CencoriWeb';
const ROBOTS_MAX_BYTES = 512 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface RobotsRule {
    allow: boolean;
    pattern: string;
}

interface RobotsGroup {
    agents: string[];
    rules: RobotsRule[];
}

interface RobotsPolicy {
    groups: RobotsGroup[];
    sitemaps: string[];
}

const cache = new Map<string, { expiresAt: number; policy: RobotsPolicy }>();

export function parseRobotsSitemaps(value: string, origin?: string): string[] {
    const urls = new Set<string>();
    for (const rawLine of value.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, '').trim();
        const separator = line.indexOf(':');
        if (separator < 0 || line.slice(0, separator).trim().toLowerCase() !== 'sitemap') continue;
        const candidate = line.slice(separator + 1).trim();
        try {
            const url = origin ? new URL(candidate, origin) : new URL(candidate);
            if (url.protocol === 'http:' || url.protocol === 'https:') urls.add(url.toString());
        } catch {
            // Ignore malformed sitemap declarations.
        }
    }
    return [...urls];
}

export function parseRobotsTxt(value: string): RobotsGroup[] {
    const groups: RobotsGroup[] = [];
    let current: RobotsGroup | null = null;
    let hasRules = false;

    for (const rawLine of value.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, '').trim();
        if (!line) continue;
        const separator = line.indexOf(':');
        if (separator < 0) continue;
        const key = line.slice(0, separator).trim().toLowerCase();
        const ruleValue = line.slice(separator + 1).trim();

        if (key === 'user-agent') {
            if (!current || hasRules) {
                current = { agents: [], rules: [] };
                groups.push(current);
                hasRules = false;
            }
            current.agents.push(ruleValue.toLowerCase());
        } else if ((key === 'allow' || key === 'disallow') && current) {
            if (ruleValue || key === 'allow') current.rules.push({ allow: key === 'allow', pattern: ruleValue });
            hasRules = true;
        }
    }
    return groups;
}

function patternMatches(path: string, pattern: string): boolean {
    if (!pattern) return false;
    const endAnchored = pattern.endsWith('$');
    const source = pattern
        .replace(/\$$/, '')
        .split('*')
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
    return new RegExp(`^${source}${endAnchored ? '$' : ''}`).test(path);
}

export function isPathAllowedByRobots(groups: RobotsGroup[], path: string, userAgent = USER_AGENT): boolean {
    const needle = userAgent.toLowerCase();
    const candidates = groups
        .map(group => ({
            group,
            specificity: Math.max(...group.agents.map(agent => agent === '*' ? 0 : needle.includes(agent) ? agent.length : -1)),
        }))
        .filter(candidate => candidate.specificity >= 0);
    if (candidates.length === 0) return true;
    const maxSpecificity = Math.max(...candidates.map(candidate => candidate.specificity));
    const rules = candidates
        .filter(candidate => candidate.specificity === maxSpecificity)
        .flatMap(candidate => candidate.group.rules)
        .filter(rule => patternMatches(path, rule.pattern));
    if (rules.length === 0) return true;
    rules.sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow));
    return rules[0].allow;
}

async function getRobotsPolicy(url: URL): Promise<RobotsPolicy> {
    const origin = url.origin;
    const cached = cache.get(origin);
    if (cached && cached.expiresAt > Date.now()) return cached.policy;

    let groups: RobotsGroup[] = [];
    let sitemaps: string[] = [];
    try {
        const response = await safeOutboundFetch(new URL('/robots.txt', origin), {
            headers: { 'User-Agent': `${USER_AGENT}/1.0 (+https://cencori.com/web)` },
            signal: AbortSignal.timeout(5_000),
        }, { maxRedirects: 2 });
        if (response.status === 401 || response.status === 403) {
            groups = [{ agents: ['*'], rules: [{ allow: false, pattern: '/' }] }];
        } else if (response.ok) {
            const value = (await readResponseBuffer(response, ROBOTS_MAX_BYTES)).toString('utf8');
            groups = parseRobotsTxt(value);
            sitemaps = parseRobotsSitemaps(value, origin);
        } else {
            await response.body?.cancel().catch(() => undefined);
        }
    } catch {
        // A missing or temporarily unavailable robots file is treated as no policy.
        groups = [];
    }
    const policy = { groups, sitemaps };
    cache.set(origin, { policy, expiresAt: Date.now() + CACHE_TTL_MS });
    return policy;
}

export async function assertRobotsAllowed(value: string | URL): Promise<void> {
    const url = value instanceof URL ? value : new URL(value);
    const policy = await getRobotsPolicy(url);
    if (!isPathAllowedByRobots(policy.groups, `${url.pathname}${url.search}`)) {
        throw new WebRuntimeError('robots_denied', 'The site robots policy does not allow this URL to be retrieved', 403);
    }
}

export async function getRobotsSitemaps(value: string | URL): Promise<string[]> {
    const url = value instanceof URL ? value : new URL(value);
    return (await getRobotsPolicy(url)).sitemaps;
}

export function clearRobotsCacheForTests(): void {
    cache.clear();
}
