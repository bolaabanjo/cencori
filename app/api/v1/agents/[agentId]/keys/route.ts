import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { handleCorsPreFlight } from '@/lib/gateway-middleware';
import { extractCencoriApiKeyFromHeaders } from '@/lib/api-keys';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const respondError = (status: number, message: string, code = 'invalid_request_error') =>
    NextResponse.json(
        { error: { message, type: 'invalid_request_error', code }, status: 'failed' },
        { status }
    );

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
) {
    try {
        const { agentId } = await params;
        const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);
        const adminClient = createAdminClient();
        let userId: string | null = null;
        let projectId: string;

        if (providedApiKey) {
            return respondError(
                403,
                'Creating credentials requires an authenticated organization owner session',
                'dashboard_auth_required',
            );
        } else {
            const authHeader = req.headers.get('Authorization');
            if (!authHeader) return respondError(401, 'Missing API key or Authorization header', 'unauthorized');
            const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await userClient.auth.getUser();
            if (authError || !user) return respondError(401, 'Unauthorized', 'unauthorized');
            userId = user.id;

            const { data: agent } = await adminClient
                .from('agents')
                .select('id, project_id, projects!inner(organization_id, organizations!inner(owner_id))')
                .eq('id', agentId)
                .single();

            if (!agent) return respondError(404, 'Agent not found', 'agent_not_found');

            const nested = agent.projects as unknown as { organization_id: string; organizations: { owner_id: string } };
            if (nested.organizations.owner_id !== userId) {
                return respondError(403, 'Only organization owners can create agent keys', 'forbidden');
            }
            projectId = agent.project_id;
        }

        let body: {
            name?: string;
            environment?: 'production' | 'test';
            key_type?: 'secret' | 'publishable';
            allowed_domains?: string[];
        };
        try {
            body = await req.json();
        } catch {
            return respondError(400, 'Request body must be valid JSON', 'invalid_json');
        }

        const name = body.name?.trim() || `Agent Key`;
        const environment = body.environment || 'production';
        const keyType = body.key_type || 'secret';

        if (!['production', 'test'].includes(environment)) {
            return respondError(400, "environment must be 'production' or 'test'", 'invalid_environment');
        }
        if (!['secret', 'publishable'].includes(keyType)) {
            return respondError(400, "key_type must be 'secret' or 'publishable'", 'invalid_key_type');
        }
        if (keyType === 'publishable' && (
            !Array.isArray(body.allowed_domains)
            || body.allowed_domains.length === 0
            || body.allowed_domains.some(domain => typeof domain !== 'string' || !domain.trim())
        )) {
            return respondError(
                400,
                'publishable keys require at least one valid allowed domain',
                'invalid_allowed_domains',
            );
        }

        const typePrefix = keyType === 'publishable' ? 'cpk' : 'csk';
        const envSuffix = environment === 'test' ? '_test' : '';
        const prefix = `${typePrefix}${envSuffix}_`;

        const randomBytes = crypto.randomBytes(24);
        const keyString = randomBytes.toString('hex');
        const fullKey = `${prefix}${keyString}`;
        const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');

        const prefixDisplayLength = prefix.length + 4;

        const { data: newKey, error: createError } = await adminClient
            .from('api_keys')
            .insert({
                project_id: projectId,
                name,
                key_prefix: fullKey.substring(0, prefixDisplayLength) + '...',
                key_hash: keyHash,
                created_by: userId,
                environment,
                key_type: keyType,
                agent_id: agentId,
                allowed_domains: keyType === 'publishable' ? (body.allowed_domains || []) : null,
            })
            .select()
            .single();

        if (createError) {
            console.error('[Agents API] Error creating agent key:', createError);
            return respondError(500, 'Failed to create API key', 'key_creation_failed');
        }

        return NextResponse.json({
            id: newKey.id,
            name: newKey.name,
            key_prefix: newKey.key_prefix,
            full_key: fullKey,
            environment: newKey.environment,
            key_type: newKey.key_type,
            agent_id: newKey.agent_id,
            created_at: newKey.created_at,
        }, { status: 201 });
    } catch (error: unknown) {
        console.error('[Agents API] Error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return respondError(500, message, 'internal_error');
    }
}
