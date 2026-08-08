export type WebFetchFormat = 'raw' | 'text';

export interface WebLink {
    url: string;
    text: string;
    rel: string[];
    internal: boolean;
}

export interface WebEvidenceSpan {
    id: string;
    text: string;
    start: number;
    end: number;
}

export interface FetchedWebResource {
    url: string;
    finalUrl: string;
    statusCode: number;
    mimeType: string;
    body: string;
    bytes: number;
    contentHash: string;
    retrievedAt: string;
    headers: {
        cacheControl: string | null;
        etag: string | null;
        lastModified: string | null;
        xRobotsTag: string | null;
    };
}

export interface ExtractedWebDocument {
    url: string;
    canonicalUrl: string;
    title: string;
    description: string | null;
    language: string | null;
    content: string;
    contentHash: string;
    mimeType: string;
    statusCode: number;
    retrievedAt: string;
    publishedAt: string | null;
    modifiedAt: string | null;
    links: WebLink[];
    evidenceSpans: WebEvidenceSpan[];
    metadata: Record<string, string>;
}

export interface WebSearchOptions {
    limit?: number;
    domain?: string;
    freshness?: string | Date;
    language?: string;
    /** Internal precomputed query embedding from Cencori-owned query compute. */
    queryEmbedding?: number[] | null;
}

export interface WebSearchResult {
    id: string;
    title: string;
    url: string;
    canonicalUrl: string;
    snippet: string;
    score: number;
    contentHash: string;
    retrievedAt: string;
    publishedAt: string | null;
    evidence: {
        quote: string;
        contentHash: string;
        retrievedAt: string;
    };
}

export interface WebCrawlOptions {
    seeds: string[];
    maxPages?: number;
    maxDepth?: number;
    sameOrigin?: boolean;
}

export interface WebCrawlPageResult {
    url: string;
    status: 'indexed' | 'skipped' | 'failed';
    documentId?: string;
    error?: string;
}

export interface WebCrawlResult {
    pages: WebCrawlPageResult[];
    indexed: number;
    failed: number;
    discovered: number;
}

export type WebCrawlJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type WebFrontierKind = 'page' | 'sitemap';

export interface WebCrawlJob {
    id: string;
    collectionId: string;
    visibility: 'public' | 'project';
    status: WebCrawlJobStatus;
    seeds: string[];
    allowedOrigins: string[];
    sameOrigin: boolean;
    maxPages: number;
    maxFrontier: number;
    maxDepth: number;
    maxAttempts: number;
    pagesDiscovered: number;
    itemsProcessed: number;
    pagesProcessed: number;
    pagesIndexed: number;
    pagesFailed: number;
    pagesSkipped: number;
    lastError: string | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
}

export interface PublicCrawlJobOptions {
    seeds: string[];
    maxPages?: number;
    maxFrontier?: number;
    maxDepth?: number;
    maxAttempts?: number;
    priority?: number;
    sameOrigin?: boolean;
    metadata?: Record<string, unknown>;
}

export interface WebFrontierWorkerResult {
    workerId: string;
    batches: number;
    claimed: number;
    indexed: number;
    failed: number;
    skipped: number;
    retried: number;
    discovered: number;
    jobs: string[];
    elapsedMs: number;
}

export type WebBrowserAction =
    | { type: 'click'; selector: string }
    | { type: 'type'; selector: string; text: string; clear?: boolean }
    | { type: 'press'; key: string }
    | { type: 'select'; selector: string; values: string[] }
    | { type: 'waitFor'; selector?: string; milliseconds?: number };

export interface WebBrowserOptions {
    actions?: WebBrowserAction[];
    timeoutMs?: number;
    waitUntil?: 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    screenshot?: boolean;
    viewport?: { width: number; height: number };
}

export type WebBrowserJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WebBrowserJob {
    id: string;
    url: string;
    actions: WebBrowserAction[];
    options: Omit<WebBrowserOptions, 'actions'>;
    status: WebBrowserJobStatus;
    result: Record<string, unknown> | null;
    error: string | null;
    attempts: number;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
}
