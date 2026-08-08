import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { authorizeWebCrawlAdmin } from '@/lib/web/internal-auth';
import { createWebDataStore } from '@/lib/web/store';
import { normalizeDomain } from '@/lib/web/url';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    if (!await authorizeWebCrawlAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    try {
        const host = normalizeDomain(new URL(req.url).searchParams.get('host') || '');
        return NextResponse.json({ policies: await createWebDataStore(createAdminClient()).getDomainPolicies(host) });
    } catch (error) { return NextResponse.json({ error: 'invalid_host', message: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}

export async function POST(req: NextRequest) {
    if (!await authorizeWebCrawlAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    try {
        const body = await req.json() as Record<string, unknown>;
        const action = String(body.action || '');
        if (!['allow', 'deny', 'noindex', 'noarchive', 'nosnippet'].includes(action)) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
        const reason = String(body.reason || '').trim();
        if (!reason) return NextResponse.json({ error: 'reason_required' }, { status: 400 });
        const host = normalizeDomain(String(body.host || ''));
        const pathPrefix = typeof body.pathPrefix === 'string' && body.pathPrefix.startsWith('/') ? body.pathPrefix : '/';
        const store = createWebDataStore(createAdminClient());
        const policy = await store.createDomainPolicy({
            host,
            path_prefix: pathPrefix,
            action, reason, source: String(body.source || 'operator'),
            jurisdiction: typeof body.jurisdiction === 'string' ? body.jurisdiction : null,
            expires_at: typeof body.expiresAt === 'string' ? body.expiresAt : null,
            created_by: null,
        });
        if (action === 'deny' || action === 'noindex') await store.deleteDocumentsByPolicy(host, pathPrefix);
        return NextResponse.json({ policy }, { status: 201 });
    } catch (error) { return NextResponse.json({ error: 'invalid_policy', message: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}

export async function DELETE(req: NextRequest) {
    if (!await authorizeWebCrawlAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
    await createWebDataStore(createAdminClient()).deleteDomainPolicy(id);
    return NextResponse.json({ deleted: true, id });
}
