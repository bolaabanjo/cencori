import { NextRequest } from 'next/server';
import { handleCorsPreFlight } from '@/lib/gateway-middleware';
import { runWebRoute } from '@/lib/web/http';
import { WebRuntimeError } from '@/lib/web/errors';
import { normalizeWebUrl } from '@/lib/web/url';
import { createWebDataStore } from '@/lib/web/store';

export const runtime = 'nodejs';

export async function OPTIONS() { return handleCorsPreFlight(); }

export async function POST(req: NextRequest) {
    return runWebRoute(req, 'web/takedown', async (body, ctx) => {
        const urls = Array.isArray(body.urls) ? [...new Set(body.urls.map(value => normalizeWebUrl(String(value))))] : [];
        const basis = String(body.basis || '');
        if (urls.length < 1 || urls.length > 100) throw new WebRuntimeError('invalid_urls', 'Provide between 1 and 100 URLs');
        if (!['copyright', 'privacy', 'legal', 'robots', 'other'].includes(basis)) throw new WebRuntimeError('invalid_basis', 'basis is invalid');
        const requesterName = String(body.requesterName || '').trim();
        const requesterEmail = String(body.requesterEmail || '').trim();
        const statement = String(body.statement || '').trim();
        if (!requesterName || !/^\S+@\S+\.\S+$/.test(requesterEmail) || statement.length < 20 || statement.length > 20_000) {
            throw new WebRuntimeError('invalid_takedown', 'A requester name, valid email, and statement of 20 to 20,000 characters are required');
        }
        const request = await createWebDataStore(ctx.supabase).createTakedownRequest({
            requester_name: requesterName, requester_email: requesterEmail,
            requester_organization: typeof body.requesterOrganization === 'string' ? body.requesterOrganization.trim() || null : null,
            urls, basis, statement,
        });
        return { status: 202, body: { id: request.id, status: request.status, createdAt: request.created_at } };
    });
}
