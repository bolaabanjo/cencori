import { NextRequest } from 'next/server';
import { handleCorsPreFlight } from '@/lib/gateway-middleware';
import { crawlWeb } from '@/lib/web/crawl';
import { runWebRoute } from '@/lib/web/http';
import { WebRuntimeError } from '@/lib/web/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    return runWebRoute(req, 'web/crawl', async (body, ctx) => {
        if (!Array.isArray(body.seeds) || !body.seeds.every(seed => typeof seed === 'string')) {
            throw new WebRuntimeError('invalid_seeds', 'seeds must be an array of URLs');
        }
        const result = await crawlWeb(ctx, {
            seeds: body.seeds as string[],
            maxPages: typeof body.maxPages === 'number' ? body.maxPages : undefined,
            maxDepth: typeof body.maxDepth === 'number' ? body.maxDepth : undefined,
            sameOrigin: typeof body.sameOrigin === 'boolean' ? body.sameOrigin : undefined,
        });
        return {
            body: result,
            metadata: {
                seeds: body.seeds.length,
                indexed: result.indexed,
                failed: result.failed,
                discovered: result.discovered,
            },
        };
    });
}
