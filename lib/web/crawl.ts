import type { GatewayContext } from '@/lib/gateway-middleware';
import { extractWebDocument } from './html';
import { fetchWebResource } from './fetch';
import { indexWebDocument } from './index';
import type { WebCrawlOptions, WebCrawlResult } from './types';
import { normalizeWebUrl } from './url';
import { WebRuntimeError } from './errors';
import { createWebDataStore } from './store';

interface QueuedUrl {
    url: string;
    depth: number;
}

export async function crawlWeb(
    ctx: Pick<GatewayContext, 'supabase' | 'organizationId' | 'projectId'>,
    options: WebCrawlOptions,
): Promise<WebCrawlResult> {
    if (!Array.isArray(options.seeds) || options.seeds.length === 0) {
        throw new WebRuntimeError('invalid_seeds', 'seeds must contain at least one URL');
    }
    if (options.seeds.length > 20) {
        throw new WebRuntimeError('invalid_seeds', 'A crawl may contain at most 20 seed URLs');
    }

    const maxPages = Math.min(Math.max(Math.floor(options.maxPages ?? 10), 1), 25);
    const maxDepth = Math.min(Math.max(Math.floor(options.maxDepth ?? 1), 0), 3);
    const maxQueued = Math.min(maxPages * 20, 500);
    const sameOrigin = options.sameOrigin !== false;
    const seedUrls = options.seeds.map(seed => normalizeWebUrl(seed));
    const seedOrigins = new Set(seedUrls.map(seed => new URL(seed).origin));
    const queue: QueuedUrl[] = seedUrls.map(url => ({ url, depth: 0 }));
    const queued = new Set(seedUrls);
    const visited = new Set<string>();
    const pages: WebCrawlResult['pages'] = [];
    const store = createWebDataStore(ctx.supabase);

    while (queue.length > 0 && visited.size < maxPages) {
        const next = queue.shift()!;
        if (visited.has(next.url)) continue;
        visited.add(next.url);

        try {
            const resource = await fetchWebResource(next.url);
            const document = extractWebDocument(resource);
            if (document.content.length < 20) {
                pages.push({ url: next.url, status: 'skipped', error: 'Page did not contain enough indexable text' });
                continue;
            }
            const documentId = await indexWebDocument(
                store,
                ctx.organizationId,
                ctx.projectId,
                document,
            );
            pages.push({ url: next.url, status: 'indexed', documentId });

            if (next.depth >= maxDepth) continue;
            for (const link of document.links) {
                if (queued.size >= maxQueued) break;
                if (link.rel.includes('nofollow')) continue;
                const origin = new URL(link.url).origin;
                if (sameOrigin && !seedOrigins.has(origin)) continue;
                if (queued.has(link.url) || visited.has(link.url)) continue;
                queued.add(link.url);
                queue.push({ url: link.url, depth: next.depth + 1 });
            }
        } catch (error) {
            const skipped = error instanceof WebRuntimeError && error.code === 'robots_denied';
            pages.push({
                url: next.url,
                status: skipped ? 'skipped' : 'failed',
                error: error instanceof Error ? error.message : 'Crawl failed',
            });
        }
    }

    return {
        pages,
        indexed: pages.filter(page => page.status === 'indexed').length,
        failed: pages.filter(page => page.status === 'failed').length,
        discovered: queued.size,
    };
}
