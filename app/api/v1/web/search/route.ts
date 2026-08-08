import { NextRequest } from 'next/server';
import { handleCorsPreFlight } from '@/lib/gateway-middleware';
import { WebRuntimeError } from '@/lib/web/errors';
import { runWebRoute } from '@/lib/web/http';
import { searchWebIndex } from '@/lib/web/index';
import { createWebDataStore } from '@/lib/web/store';
import { requestOwnedQueryEmbedding } from '@/lib/web/query-compute';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    return runWebRoute(req, 'web/search', async (body, ctx) => {
        if (typeof body.query !== 'string' || !body.query.trim()) {
            throw new WebRuntimeError('invalid_query', 'query is required');
        }
        const store = createWebDataStore(ctx.supabase);
        const queryEmbedding = await requestOwnedQueryEmbedding(store, ctx.projectId, body.query);
        const results = await searchWebIndex(store, ctx.projectId, body.query, {
            limit: typeof body.limit === 'number' ? body.limit : undefined,
            domain: typeof body.domain === 'string' ? body.domain : undefined,
            freshness: typeof body.freshness === 'string' ? body.freshness : undefined,
            language: typeof body.language === 'string' ? body.language : undefined,
            queryEmbedding,
        });
        return {
            body: {
                query: body.query.trim(),
                results,
                count: results.length,
                searchEngine: 'cencori-web-hybrid-v2',
            },
            metadata: { query_length: body.query.length, results: results.length },
        };
    });
}
