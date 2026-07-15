import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { checkRateLimit } from '@/lib/rate-limit';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_COUNTER = 10_000_000;
const MAX_SCAN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TelemetryPayload {
    event: 'scan_completed';
    version: string;
    platform: string;
    filesScanned: number;
    issuesFound: number;
    score: string;
    hasApiKey: boolean;
    scanDuration: number;
    issueBreakdown: {
        secrets: number;
        pii: number;
        routes: number;
        config: number;
        vulnerabilities: number;
    };
}

function clientIp(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')?.trim()
        || 'unknown';
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isBoundedCounter(value: unknown, max = MAX_COUNTER): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
}

function parsePayload(value: unknown): TelemetryPayload | null {
    if (!isObject(value) || !isObject(value.issueBreakdown)) {
        return null;
    }

    const breakdown = value.issueBreakdown;
    const validBreakdown = ['secrets', 'pii', 'routes', 'config', 'vulnerabilities']
        .every((key) => isBoundedCounter(breakdown[key]));

    if (
        value.event !== 'scan_completed'
        || !isBoundedString(value.version, 64)
        || !isBoundedString(value.platform, 64)
        || !isBoundedString(value.score, 32)
        || typeof value.hasApiKey !== 'boolean'
        || !isBoundedCounter(value.filesScanned)
        || !isBoundedCounter(value.issuesFound)
        || !isBoundedCounter(value.scanDuration, MAX_SCAN_DURATION_MS)
        || !validBreakdown
    ) {
        return null;
    }

    return value as unknown as TelemetryPayload;
}

async function readPayload(request: NextRequest): Promise<unknown> {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
        throw new Error('PAYLOAD_TOO_LARGE');
    }

    if (!request.body) {
        throw new Error('INVALID_JSON');
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let body = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
            await reader.cancel();
            throw new Error('PAYLOAD_TOO_LARGE');
        }
        body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();

    try {
        return JSON.parse(body);
    } catch {
        throw new Error('INVALID_JSON');
    }
}

export async function POST(request: NextRequest) {
    const rateLimit = await checkRateLimit(`scan_telemetry:${clientIp(request)}`, {
        route: request.nextUrl.pathname,
    });

    if (!rateLimit.allowed) {
        const unavailable = rateLimit.reason === 'backend_unavailable';
        return NextResponse.json(
            { error: unavailable ? 'Rate limit unavailable' : 'Rate limit exceeded' },
            {
                status: unavailable ? 503 : 429,
                headers: unavailable
                    ? undefined
                    : { 'Retry-After': String(Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000))) },
            }
        );
    }

    try {
        const payload = parsePayload(await readPayload(request));
        if (!payload) {
            return NextResponse.json({ error: 'Invalid telemetry payload' }, { status: 400 });
        }

        const { error } = await supabase.from('scan_telemetry').insert({
            event: payload.event,
            version: payload.version,
            platform: payload.platform,
            files_scanned: payload.filesScanned,
            issues_found: payload.issuesFound,
            score: payload.score,
            has_api_key: payload.hasApiKey,
            scan_duration_ms: payload.scanDuration,
            secrets_count: payload.issueBreakdown.secrets,
            pii_count: payload.issueBreakdown.pii,
            routes_count: payload.issueBreakdown.routes,
            config_count: payload.issueBreakdown.config,
            vulnerabilities_count: payload.issueBreakdown.vulnerabilities,
        });

        if (error) {
            console.error('Telemetry insert error:', error);
            return NextResponse.json({ error: 'Telemetry storage unavailable' }, { status: 503 });
        }

        return NextResponse.json({ accepted: true }, { status: 202 });
    } catch (error) {
        if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') {
            return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
        }

        if (error instanceof Error && error.message === 'INVALID_JSON') {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        console.error('Telemetry error:', error);
        return NextResponse.json({ error: 'Telemetry unavailable' }, { status: 503 });
    }
}
