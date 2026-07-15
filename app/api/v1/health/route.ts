import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const HEALTH_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, max-age=0',
    'X-Cencori-Health': 'ok',
};

export async function GET() {
    return NextResponse.json(
        {
            status: 'ok',
            service: 'cencori-api',
            version: 'v1',
            timestamp: new Date().toISOString(),
        },
        { status: 200, headers: HEALTH_HEADERS },
    );
}

export async function HEAD() {
    return new NextResponse(null, {
        status: 200,
        headers: HEALTH_HEADERS,
    });
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            ...HEALTH_HEADERS,
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        },
    });
}
