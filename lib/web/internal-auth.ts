import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { checkInternalAccess } from '@/lib/internal-access';
import { createServerClient } from '@/lib/supabaseServer';

function safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function authorizeWebCrawlAdmin(req: NextRequest): Promise<boolean> {
    const configuredSecret = process.env.WEB_CRAWL_ADMIN_SECRET;
    const authorization = req.headers.get('authorization');
    if (configuredSecret && authorization?.startsWith('Bearer ')) {
        if (safeEqual(authorization.slice('Bearer '.length), configuredSecret)) return true;
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    return checkInternalAccess(user.id, user.email);
}
