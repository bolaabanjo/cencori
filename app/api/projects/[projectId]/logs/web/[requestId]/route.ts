import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';

type JsonRecord = Record<string, unknown>;

function parseProjectScopeFromPath(pathname: string): { orgSlug: string; projectSlug: string } | null {
    const match = pathname.match(/^\/dashboard\/organizations\/([^/]+)\/projects\/([^/]+)(?:\/|$)/);
    if (!match) return null;
    return { orgSlug: match[1], projectSlug: match[2] };
}

function getNestedValue(record: JsonRecord | null, path: string[]): unknown {
    let current: unknown = record;

    for (const key of path) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
            return null;
        }

        current = (current as JsonRecord)[key];
    }

    return current ?? null;
}

function getNestedString(record: JsonRecord | null, path: string[]): string | null {
    const value = getNestedValue(record, path);
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function getNestedNumber(record: JsonRecord | null, path: string[]): number | null {
    const value = getNestedValue(record, path);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ projectId: string; requestId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId, requestId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;

    try {
        const { data: log, error } = await supabaseAdmin
            .from('web_request_logs')
            .select('*')
            .eq('id', requestId)
            .eq('project_id', projectId)
            .single();

        if (error || !log) {
            return NextResponse.json(
                { error: 'Web request log not found' },
                { status: 404 }
            );
        }

        const metadataRaw = (log as { metadata?: unknown }).metadata;
        const metadata =
            metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
                ? (metadataRaw as JsonRecord)
                : null;

        const queryParams = Array.from(new URLSearchParams(log.query_string || '').entries()).map(
            ([key, value]) => ({ key, value })
        );
        const pathScope = parseProjectScopeFromPath(log.path);

        const protocol = getNestedString(metadata, ['connection', 'protocol']) || 'https';
        const fullUrl = `${protocol}://${log.host}${log.path}${log.query_string ? `?${log.query_string}` : ''}`;

        return NextResponse.json({
            id: log.id,
            project_id: log.project_id,
            organization_id: log.organization_id,
            request_id: log.request_id,
            host: log.host,
            method: log.method,
            path: log.path,
            query_string: log.query_string ?? null,
            status_code: log.status_code,
            message: log.message ?? null,
            user_agent: log.user_agent ?? null,
            referer: log.referer ?? null,
            ip_address: log.ip_address ?? null,
            country_code: log.country_code ?? null,
            metadata,
            created_at: log.created_at,
            derived: {
                full_url: fullUrl,
                org_slug: pathScope?.orgSlug || getNestedString(metadata, ['scope', 'org_slug']),
                project_slug: pathScope?.projectSlug || getNestedString(metadata, ['scope', 'project_slug']),
                query_params: queryParams,
                query_count: getNestedNumber(metadata, ['scope', 'query_count']) ?? queryParams.length,
                protocol: getNestedString(metadata, ['connection', 'protocol']),
                runtime_source: getNestedString(metadata, ['runtime', 'source']),
                runtime_env: getNestedString(metadata, ['runtime', 'env']),
                accept: getNestedString(metadata, ['request_headers', 'accept']),
                accept_language: getNestedString(metadata, ['request_headers', 'accept_language']),
                sec_fetch_site: getNestedString(metadata, ['request_headers', 'sec_fetch_site']),
                sec_fetch_mode: getNestedString(metadata, ['request_headers', 'sec_fetch_mode']),
                sec_fetch_dest: getNestedString(metadata, ['request_headers', 'sec_fetch_dest']),
                vercel_request_id: getNestedString(metadata, ['vercel', 'request_id']),
                vercel_deployment_url: getNestedString(metadata, ['vercel', 'deployment_url']),
                vercel_ip_city: getNestedString(metadata, ['vercel', 'ip_city']),
                vercel_ip_region: getNestedString(metadata, ['vercel', 'ip_region']),
                vercel_ip_continent: getNestedString(metadata, ['vercel', 'ip_continent']),
            },
        });
    } catch (unexpectedError) {
        console.error('[Web Request Detail API] Unexpected error:', unexpectedError);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
