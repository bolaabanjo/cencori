import { NextRequest, NextResponse } from 'next/server';
import { SendByte } from '@sendbyte/node';
import { Redis } from '@upstash/redis';
import { createAdminClient } from '@/lib/supabaseAdmin';
import {
    generateToken,
    isValidEmail,
    normalizeEmail,
    renderWelcomeEmail,
    buildUnsubscribeUrl,
    getBaseUrl,
} from '@/lib/newsletter';

const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_NEWSLETTER_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '';

// Per-IP rate limit: 3 newsletter signups per hour.
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SEC = 60 * 60;

let redisClient: Redis | null | undefined;
function getRedis(): Redis | null {
    if (redisClient !== undefined) return redisClient;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        redisClient = null;
        return redisClient;
    }
    redisClient = new Redis({ url, token });
    return redisClient;
}

async function isRateLimited(ip: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false; // fail-open if Redis not configured
    const key = `newsletter:signup:${ip}`;
    try {
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
        }
        return count > RATE_LIMIT_MAX;
    } catch (err) {
        console.error('[Newsletter] Rate limit check failed:', err);
        return false; // fail-open on Redis errors
    }
}

export async function POST(req: NextRequest) {
    if (!SENDBYTE_API_KEY || !FROM_EMAIL) {
        return NextResponse.json({ error: 'Newsletter not configured' }, { status: 500 });
    }

    let body: { email?: string; source?: string; website?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Honeypot — real users never fill the hidden `website` field.
    // Bots that scrape the form will fill it. Return success silently so
    // they don't learn the trap exists.
    if (body.website && body.website.trim() !== '') {
        return NextResponse.json({ success: true });
    }

    if (!body.email || !isValidEmail(body.email)) {
        return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const email = normalizeEmail(body.email);
    const source = (body.source || 'website').slice(0, 64);
    const ipAddress =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';
    const userAgent = req.headers.get('user-agent')?.slice(0, 512) || null;

    // Per-IP rate limit
    if (ipAddress !== 'unknown' && (await isRateLimited(ipAddress))) {
        return NextResponse.json(
            { error: 'Too many signups from this IP. Please try again later.' },
            { status: 429 }
        );
    }

    const admin = createAdminClient();

    // Look up existing subscriber.
    const { data: existing } = await admin
        .from('newsletter_subscribers')
        .select('id, status, unsubscribe_token')
        .eq('email', email)
        .maybeSingle();

    let unsubscribeToken: string;
    let isNewSubscriber = true;

    if (existing) {
        if (existing.status === 'confirmed') {
            // Already on the list — return success silently. Don't re-send welcome.
            return NextResponse.json({ success: true, alreadySubscribed: true });
        }

        // pending or unsubscribed → flip to confirmed, reuse or regenerate tokens.
        unsubscribeToken = existing.unsubscribe_token || generateToken();
        isNewSubscriber = existing.status !== 'pending';

        const { error: updateError } = await admin
            .from('newsletter_subscribers')
            .update({
                status: 'confirmed',
                unsubscribe_token: unsubscribeToken,
                source,
                ip_address: ipAddress === 'unknown' ? null : ipAddress,
                user_agent: userAgent,
                subscribed_at: new Date().toISOString(),
                confirmed_at: new Date().toISOString(),
                unsubscribed_at: null,
            })
            .eq('id', existing.id);

        if (updateError) {
            console.error('[Newsletter] Failed to refresh subscriber:', updateError);
            return NextResponse.json({ error: 'Could not subscribe' }, { status: 500 });
        }
    } else {
        // Single opt-in: insert directly as confirmed.
        // confirmation_token is unused now but the column is NOT NULL UNIQUE, so we still generate one.
        const confirmationToken = generateToken();
        unsubscribeToken = generateToken();

        const now = new Date().toISOString();
        const { error: insertError } = await admin
            .from('newsletter_subscribers')
            .insert({
                email,
                status: 'confirmed',
                confirmation_token: confirmationToken,
                unsubscribe_token: unsubscribeToken,
                source,
                ip_address: ipAddress === 'unknown' ? null : ipAddress,
                user_agent: userAgent,
                subscribed_at: now,
                confirmed_at: now,
            });

        if (insertError) {
            console.error('[Newsletter] Failed to insert subscriber:', insertError);
            return NextResponse.json({ error: 'Could not subscribe' }, { status: 500 });
        }
    }

    // Send welcome email (fire-and-forget — we don't block the response on send failure).
    const baseUrl = getBaseUrl();
    const unsubscribeUrl = buildUnsubscribeUrl(baseUrl, unsubscribeToken);

    if (isNewSubscriber) {
        try {
            const sendbyte = new SendByte(SENDBYTE_API_KEY);
            await sendbyte.emails.send({
                from: FROM_EMAIL,
                to: email,
                subject: 'Welcome to Cencori',
                html: renderWelcomeEmail({ unsubscribeUrl }),
                list_unsubscribe: {
                    url: unsubscribeUrl,
                },
            });
        } catch (err) {
            console.error('[Newsletter] Welcome send failed:', err);
        }
    }

    return NextResponse.json({ success: true });
}
