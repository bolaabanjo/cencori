import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { authorizeWebCrawlAdmin } from '@/lib/web/internal-auth';
import { createWebDataStore } from '@/lib/web/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    if (!await authorizeWebCrawlAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get('limit')) || 50, 1), 100);
    return NextResponse.json({ requests: await createWebDataStore(createAdminClient()).listTakedownRequests(limit) });
}

export async function PATCH(req: NextRequest) {
    if (!await authorizeWebCrawlAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json() as Record<string, unknown>;
    const id = String(body.id || '');
    const status = String(body.status || '');
    if (!id || !['approved', 'rejected', 'withdrawn'].includes(status)) return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });
    const store = createWebDataStore(createAdminClient());
    const current = await store.getTakedownRequest(id);
    if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (current.status !== 'pending') return NextResponse.json({ error: 'already_decided' }, { status: 409 });
    const reason = String(body.reason || '').trim();
    if (!reason) return NextResponse.json({ error: 'reason_required' }, { status: 400 });
    const request = await store.decideTakedownRequest(id, { status, decision_reason: reason, decided_by: null });
    return NextResponse.json({ request });
}
