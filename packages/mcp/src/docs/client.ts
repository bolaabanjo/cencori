import type {
    DocNavigationResponse,
    DocRawResponse,
    DocSearchResponse,
} from './types.js';
import { fetchSignal, readHttpErrorMessage } from '../http.js';

export class DocsClient {
    constructor(private readonly baseUrl: string) {}

    async search(query: string): Promise<DocSearchResponse> {
        const url = new URL('/api/docs/search', this.baseUrl);
        url.searchParams.set('q', query);

        const response = await fetch(url, { signal: fetchSignal() });
        if (!response.ok) {
            const message = await readHttpErrorMessage(response);
            throw new Error(`Docs search failed (${response.status}): ${message}`);
        }

        return response.json() as Promise<DocSearchResponse>;
    }

    async getDoc(slug: string): Promise<DocRawResponse> {
        const normalizedSlug = slug.replace(/^\/docs\//, '').replace(/^\//, '');
        const url = new URL('/api/docs/raw', this.baseUrl);
        url.searchParams.set('slug', normalizedSlug);

        const response = await fetch(url, { signal: fetchSignal() });
        if (response.status === 404) {
            return { content: '', error: `Document not found: ${normalizedSlug}` };
        }
        if (!response.ok) {
            const message = await readHttpErrorMessage(response);
            throw new Error(`Docs fetch failed (${response.status}): ${message}`);
        }

        return response.json() as Promise<DocRawResponse>;
    }

    async listNavigation(): Promise<DocNavigationResponse> {
        const url = new URL('/api/docs/navigation', this.baseUrl);
        const response = await fetch(url, { signal: fetchSignal() });
        if (!response.ok) {
            const message = await readHttpErrorMessage(response);
            throw new Error(`Docs navigation failed (${response.status}): ${message}`);
        }

        return response.json() as Promise<DocNavigationResponse>;
    }

    /** Fetch the raw `llm.txt` integration contract (public, no auth). */
    async getIntegrationGuide(): Promise<string> {
        const url = new URL('/llm.txt', this.baseUrl);
        const response = await fetch(url, { signal: fetchSignal() });
        if (!response.ok) {
            const message = await readHttpErrorMessage(response);
            throw new Error(`Integration guide fetch failed (${response.status}): ${message}`);
        }
        return response.text();
    }
}
