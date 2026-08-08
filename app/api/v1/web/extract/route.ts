import { NextRequest } from 'next/server';
import { handleCorsPreFlight } from '@/lib/gateway-middleware';
import { WebRuntimeError } from '@/lib/web/errors';
import { fetchWebResource } from '@/lib/web/fetch';
import { extractWebDocument } from '@/lib/web/html';
import { runWebRoute } from '@/lib/web/http';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    return runWebRoute(req, 'web/extract', async body => {
        if (typeof body.url !== 'string' || !body.url.trim()) {
            throw new WebRuntimeError('invalid_url', 'url is required');
        }
        const resource = await fetchWebResource(body.url, {
            maxBytes: typeof body.maxBytes === 'number' ? body.maxBytes : undefined,
            timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
        });
        const document = extractWebDocument(resource);
        return {
            body: {
                ...document,
                untrusted: true,
            },
            metadata: {
                url: document.canonicalUrl,
                content_length: document.content.length,
                evidence_spans: document.evidenceSpans.length,
            },
        };
    });
}
