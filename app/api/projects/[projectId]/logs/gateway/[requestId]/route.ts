import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';

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
            .from('api_gateway_request_logs')
            .select('*')
            .eq('id', requestId)
            .eq('project_id', projectId)
            .single();

        if (error || !log) {
            return NextResponse.json(
                { error: 'Gateway request log not found' },
                { status: 404 }
            );
        }

        let apiKeyInfo: {
            id: string;
            name: string;
            key_prefix: string;
            environment: string | null;
            created_at: string | null;
            revoked_at: string | null;
        } | null = null;

        if (log.api_key_id) {
            const { data: keyData } = await supabaseAdmin
                .from('api_keys')
                .select('id, name, key_prefix, environment, created_at, revoked_at')
                .eq('id', log.api_key_id)
                .single();

            if (keyData) {
                apiKeyInfo = {
                    id: keyData.id,
                    name: keyData.name,
                    key_prefix: keyData.key_prefix,
                    environment: keyData.environment,
                    created_at: keyData.created_at ?? null,
                    revoked_at: keyData.revoked_at ?? null,
                };
            }
        }

        return NextResponse.json({
            id: log.id,
            project_id: log.project_id,
            api_key_id: log.api_key_id,
            request_id: log.request_id,
            endpoint: log.endpoint,
            method: log.method,
            status_code: log.status_code,
            latency_ms: log.latency_ms,
            environment: log.environment,
            caller_origin: log.caller_origin ?? null,
            client_app: log.client_app ?? null,
            ip_address: log.ip_address ?? null,
            country_code: log.country_code ?? null,
            user_agent: log.user_agent ?? null,
            error_code: log.error_code ?? null,
            error_message: log.error_message ?? null,
            metadata: log.metadata ?? {},
            created_at: log.created_at,
            api_key: apiKeyInfo,
        });
    } catch (unexpectedError) {
        console.error('[Gateway Request Detail API] Unexpected error:', unexpectedError);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
