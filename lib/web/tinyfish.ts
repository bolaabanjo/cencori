import { createHash } from 'node:crypto';
import { WebRuntimeError } from './errors';
import type { WebSearchOptions, WebSearchResult } from './types';

const TINYFISH_SEARCH_URL = 'https://api.search.tinyfish.ai';
const RESULTS_PER_PAGE = 10;
const MAX_RESULTS = 50;
const REQUEST_TIMEOUT_MS = 12_000;

interface TinyFishSearchHit {
    position: number;
    site_name: string;
    title: string;
    snippet: string;
    url: string;
}

interface TinyFishSearchResponse {
    query: string;
    results: TinyFishSearchHit[];
    total_results: number;
    page?: number;
}

interface TinyFishSearchDependencies {
    apiKey?: string;
    fetch?: typeof fetch;
    now?: () => Date;
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function normalizeDomain(value: string): string {
    const candidate = value.trim();
    if (!candidate) throw new WebRuntimeError('invalid_domain', 'domain must not be empty');

    try {
        const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
        if (!url.hostname) throw new Error('missing hostname');
        return url.hostname.toLowerCase();
    } catch {
        throw new WebRuntimeError('invalid_domain', 'domain must be a valid hostname');
    }
}

function canonicalizeUrl(value: string): string {
    try {
        const url = new URL(value);
        url.hash = '';
        return url.toString();
    } catch {
        return value;
    }
}

function isTinyFishSearchResponse(value: unknown): value is TinyFishSearchResponse {
    if (!value || typeof value !== 'object') return false;
    const response = value as Partial<TinyFishSearchResponse>;
    return typeof response.query === 'string'
        && typeof response.total_results === 'number'
        && Array.isArray(response.results)
        && response.results.every((result) => result
            && typeof result === 'object'
            && typeof result.position === 'number'
            && typeof result.title === 'string'
            && typeof result.snippet === 'string'
            && typeof result.url === 'string');
}

function upstreamError(status: number): WebRuntimeError {
    if (status === 400) return new WebRuntimeError('invalid_query', 'TinyFish rejected the search query');
    if (status === 429) return new WebRuntimeError('web_rate_limited', 'Web search is temporarily rate limited', 429);
    if (status === 401 || status === 402 || status === 403 || status === 404) {
        return new WebRuntimeError('web_provider_unavailable', 'Cencori web search is not configured', 503);
    }
    return new WebRuntimeError('web_provider_unavailable', 'Web search is temporarily unavailable', 503);
}

async function fetchPage(
    query: string,
    page: number,
    language: string | undefined,
    apiKey: string,
    fetchImpl: typeof fetch,
): Promise<TinyFishSearchHit[]> {
    const url = new URL(TINYFISH_SEARCH_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('page', String(page));
    if (language) url.searchParams.set('language', language.split('-')[0].toLowerCase());

    let response: Response;
    try {
        response = await fetchImpl(url, {
            headers: { 'X-API-Key': apiKey },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new WebRuntimeError('web_provider_unavailable', 'Web search is temporarily unavailable', 503);
    }

    if (!response.ok) throw upstreamError(response.status);

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new WebRuntimeError('web_provider_invalid_response', 'Web search returned an invalid response', 502);
    }
    if (!isTinyFishSearchResponse(body)) {
        throw new WebRuntimeError('web_provider_invalid_response', 'Web search returned an invalid response', 502);
    }
    return body.results;
}

/**
 * Searches TinyFish with a Cencori-owned server credential and maps its public
 * result format onto the stable Cencori Web contract consumed by SDK and MCP clients.
 */
export async function searchTinyFish(
    rawQuery: string,
    options: WebSearchOptions = {},
    dependencies: TinyFishSearchDependencies = {},
): Promise<WebSearchResult[]> {
    const apiKey = (dependencies.apiKey ?? process.env.TINYFISH_API_KEY)?.trim();
    if (!apiKey) {
        throw new WebRuntimeError('web_provider_unavailable', 'Cencori web search is not configured', 503);
    }

    const query = rawQuery.trim();
    const scopedQuery = options.domain ? `${query} site:${normalizeDomain(options.domain)}` : query;
    const limit = Math.min(MAX_RESULTS, Math.max(1, Math.floor(options.limit ?? RESULTS_PER_PAGE)));
    const fetchImpl = dependencies.fetch ?? fetch;
    const hits: TinyFishSearchHit[] = [];

    for (let page = 0; hits.length < limit; page += 1) {
        const pageHits = await fetchPage(scopedQuery, page, options.language, apiKey, fetchImpl);
        hits.push(...pageHits);
        if (pageHits.length < RESULTS_PER_PAGE) break;
    }

    const retrievedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    return hits.slice(0, limit).map((hit, index) => {
        const canonicalUrl = canonicalizeUrl(hit.url);
        const contentHash = sha256(`${canonicalUrl}\0${hit.snippet}`);
        const position = Number.isFinite(hit.position) && hit.position > 0 ? hit.position : index + 1;
        return {
            id: `tinyfish_${sha256(canonicalUrl).slice(0, 24)}`,
            title: hit.title,
            url: hit.url,
            canonicalUrl,
            snippet: hit.snippet,
            score: 1 / position,
            contentHash,
            retrievedAt,
            publishedAt: null,
            evidence: {
                quote: hit.snippet,
                contentHash,
                retrievedAt,
            },
        };
    });
}
