import type {
    DocNavigationResponse,
    DocRawResponse,
    DocSearchResponse,
} from './types.js';

export class DocsClient {
    constructor(private readonly baseUrl: string) {}

    async search(query: string): Promise<DocSearchResponse> {
        const url = new URL('/api/docs/search', this.baseUrl);
        url.searchParams.set('q', query);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Docs search failed (${response.status}): ${response.statusText}`);
        }

        return response.json() as Promise<DocSearchResponse>;
    }

    async getDoc(slug: string): Promise<DocRawResponse> {
        const normalizedSlug = slug.replace(/^\/docs\//, '').replace(/^\//, '');
        const url = new URL('/api/docs/raw', this.baseUrl);
        url.searchParams.set('slug', normalizedSlug);

        const response = await fetch(url);
        if (response.status === 404) {
            return { content: '', error: `Document not found: ${normalizedSlug}` };
        }
        if (!response.ok) {
            throw new Error(`Docs fetch failed (${response.status}): ${response.statusText}`);
        }

        return response.json() as Promise<DocRawResponse>;
    }

    async listNavigation(): Promise<DocNavigationResponse> {
        const url = new URL('/api/docs/navigation', this.baseUrl);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Docs navigation failed (${response.status}): ${response.statusText}`);
        }

        return response.json() as Promise<DocNavigationResponse>;
    }
}
