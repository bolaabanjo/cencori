import { NextRequest } from 'next/server';
import { handleCorsPreFlight } from '@/lib/gateway-middleware';
import { WebRuntimeError } from '@/lib/web/errors';
import { runWebRoute } from '@/lib/web/http';
import { searchTinyFish } from '@/lib/web/tinyfish';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    return runWebRoute(req, 'web/search', async (body) => {
        if (typeof body.query !== 'string' || !body.query.trim()) {
            throw new WebRuntimeError('invalid_query', 'query is required');
        }
        const results = await searchTinyFish(body.query, {
            limit: typeof body.limit === 'number' ? body.limit : undefined,
            domain: typeof body.domain === 'string' ? body.domain : undefined,
            freshness: typeof body.freshness === 'string' ? body.freshness : undefined,
            language: typeof body.language === 'string' ? body.language : undefined,
        });
        return {
            body: {
                query: body.query.trim(),
                results,
                count: results.length,
                searchEngine: 'tinyfish-search-v1',
            },
            metadata: { query_length: body.query.length, results: results.length },
        };
    });
}
