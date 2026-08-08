import { NextRequest } from 'next/server';
import { handleCorsPreFlight } from '@/lib/gateway-middleware';
import { fetchWebResource } from '@/lib/web/fetch';
import { runWebRoute } from '@/lib/web/http';
import { WebRuntimeError } from '@/lib/web/errors';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    return runWebRoute(req, 'web/fetch', async body => {
        if (typeof body.url !== 'string' || !body.url.trim()) {
            throw new WebRuntimeError('invalid_url', 'url is required');
        }
        const resource = await fetchWebResource(body.url, {
            maxBytes: typeof body.maxBytes === 'number' ? body.maxBytes : undefined,
            timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
        });
        return {
            body: {
                ...resource,
                untrusted: true,
            },
            metadata: { url: resource.finalUrl, bytes: resource.bytes, status_code: resource.statusCode },
        };
    });
}
