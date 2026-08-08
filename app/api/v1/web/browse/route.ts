import { NextRequest } from 'next/server';
import { handleCorsPreFlight } from '@/lib/gateway-middleware';
import { runWebRoute } from '@/lib/web/http';
import { validateBrowserOptions } from '@/lib/web/browser';
import { normalizeWebUrl } from '@/lib/web/url';
import { createWebDataStore } from '@/lib/web/store';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() { return handleCorsPreFlight(); }

export async function POST(req: NextRequest) {
    return runWebRoute(req, 'web/browse', async (body, ctx) => {
        const url = normalizeWebUrl(String(body.url || ''));
        const validated = validateBrowserOptions(body);
        const store = createWebDataStore(ctx.supabase);
        const job = await store.createBrowserJob({
            organization_id: ctx.organizationId,
            project_id: ctx.projectId,
            url,
            actions: validated.actions,
            options: {
                timeoutMs: validated.timeoutMs, waitUntil: validated.waitUntil,
                screenshot: validated.screenshot, viewport: validated.viewport,
            },
        });
        return {
            status: 202,
            body: { id: job.id, status: job.status, url: job.url, createdAt: job.created_at },
            metadata: { actions: validated.actions.length, screenshot: validated.screenshot },
        };
    });
}
