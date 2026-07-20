import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { validateGatewayRequest, handleCorsPreFlight, type GatewayContext } from '@/lib/gateway-middleware';
import { extractCencoriApiKeyFromHeaders } from '@/lib/api-keys';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const respondError = (status: number, message: string, code = 'invalid_request_error') =>
    NextResponse.json(
        { error: { message, type: 'invalid_request_error', code }, status: 'failed' },
        { status }
    );

type AgentCreateBody = {
    project_id?: string;
    name?: string;
    description?: string;
    config?: {
        model?: string;
        system_prompt?: string;
        tools?: string[];
        temperature?: number;
    };
};

async function verifyJwtProjectAccess(
    adminClient: ReturnType<typeof createAdminClient>,
    projectId: string,
    userId: string,
): Promise<NextResponse | null> {
    const { data: project, error: projectError } = await adminClient
        .from('projects')
        .select('id, organization_id, organizations!inner(owner_id)')
        .eq('id', projectId)
        .maybeSingle();

    if (projectError) {
        console.error('[Agents API] Failed to verify project access:', projectError);
        return respondError(500, 'Failed to verify project access', 'access_check_failed');
    }
    if (!project) return respondError(404, 'Project not found', 'project_not_found');

    const ownerId = (project.organizations as { owner_id?: string } | null)?.owner_id;
    if (ownerId === userId) return null;

    const { data: membership, error: membershipError } = await adminClient
        .from('organization_members')
        .select('id')
        .eq('organization_id', project.organization_id)
        .eq('user_id', userId)
        .maybeSingle();

    if (membershipError) {
        console.error('[Agents API] Failed to verify organization membership:', membershipError);
        return respondError(500, 'Failed to verify project access', 'access_check_failed');
    }
    if (!membership) return respondError(403, 'Unauthorized for this project', 'forbidden');
    return null;
}

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    try {
        const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);
        const adminClient = createAdminClient();

        let projectId: string;
        let authenticatedUserId: string | null = null;

        if (providedApiKey) {
            const validation = await validateGatewayRequest(req);
            if (!validation.success) return validation.response;
            if (validation.context.keyType !== 'secret') {
                return respondError(403, 'Agent management requires a secret API key', 'secret_key_required');
            }
            projectId = validation.context.projectId;
        } else {
            const authHeader = req.headers.get('Authorization');
            if (!authHeader) return respondError(401, 'Missing API key or Authorization header', 'unauthorized');
            const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await userClient.auth.getUser();
            if (authError || !user) return respondError(401, 'Unauthorized', 'unauthorized');
            authenticatedUserId = user.id;
            projectId = '';
        }

        let body: AgentCreateBody;
        try {
            body = await req.json() as AgentCreateBody;
        } catch {
            return respondError(400, 'Request body must be valid JSON', 'invalid_json');
        }

        if (authenticatedUserId) {
            if (!body.project_id) return respondError(400, 'project_id is required for JWT-authenticated requests', 'missing_project_id');
            projectId = body.project_id;
            const accessError = await verifyJwtProjectAccess(adminClient, projectId, authenticatedUserId);
            if (accessError) return accessError;
        }

        if (typeof body.name !== 'string' || !body.name.trim()) {
            return respondError(400, 'name is required', 'missing_name');
        }
        if (body.description !== undefined && typeof body.description !== 'string') {
            return respondError(400, 'description must be a string', 'invalid_description');
        }
        if (body.config) {
            if (body.config.model !== undefined && (typeof body.config.model !== 'string' || !body.config.model.trim())) {
                return respondError(400, 'config.model must be a non-empty string', 'invalid_model');
            }
            if (body.config.system_prompt !== undefined && typeof body.config.system_prompt !== 'string') {
                return respondError(400, 'config.system_prompt must be a string', 'invalid_system_prompt');
            }
            if (body.config.tools !== undefined && (
                !Array.isArray(body.config.tools)
                || body.config.tools.some(tool => typeof tool !== 'string')
            )) {
                return respondError(400, 'config.tools must be an array of strings', 'invalid_tools');
            }
            if (body.config.temperature !== undefined && (
                typeof body.config.temperature !== 'number'
                || !Number.isFinite(body.config.temperature)
                || body.config.temperature < 0
                || body.config.temperature > 2
            )) {
                return respondError(400, 'config.temperature must be between 0 and 2', 'invalid_temperature');
            }
        }

        const { data: agent, error: agentError } = await adminClient
            .from('agents')
            .insert({
                project_id: projectId,
                name: body.name.trim(),
                description: body.description?.trim() || null,
                blueprint: 'custom',
                is_active: true,
                shadow_mode: true,
            })
            .select('id, name, description, is_active, shadow_mode, created_at')
            .single();

        if (agentError || !agent) {
            console.error('[Agents API] Failed to create agent:', agentError);
            return respondError(500, 'Failed to create agent', 'creation_failed');
        }

        const config = body.config || {};
        const { data: agentConfig, error: configError } = await adminClient
            .from('agent_configs')
            .insert({
                agent_id: agent.id,
                model: config.model || 'gpt-4o',
                system_prompt: config.system_prompt || null,
                tools: config.tools || [],
                temperature: config.temperature ?? 0.7,
            })
            .select('model, system_prompt, tools, temperature')
            .single();

        if (configError) {
            console.error('[Agents API] Failed to create agent config:', configError);
            await adminClient.from('agents').delete().eq('id', agent.id);
            return respondError(500, 'Failed to create agent configuration', 'config_creation_failed');
        }

        return NextResponse.json({
            id: agent.id,
            name: agent.name,
            description: agent.description,
            is_active: agent.is_active,
            shadow_mode: agent.shadow_mode,
            created_at: agent.created_at,
            config: {
                model: agentConfig.model,
                system_prompt: agentConfig.system_prompt,
                tools: agentConfig.tools,
                temperature: agentConfig.temperature,
            },
        }, { status: 201 });
    } catch (error: unknown) {
        console.error('[Agents API] Error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return respondError(500, message, 'internal_error');
    }
}

export async function GET(req: NextRequest) {
    try {
        const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);
        const adminClient = createAdminClient();
        let gatewayCtx: GatewayContext | null = null;

        let projectId: string | null = null;

        if (providedApiKey) {
            const validation = await validateGatewayRequest(req);
            if (!validation.success) return validation.response;
            if (validation.context.keyType !== 'secret') {
                return respondError(403, 'Agent management requires a secret API key', 'secret_key_required');
            }
            gatewayCtx = validation.context;
            projectId = gatewayCtx.projectId;
        } else {
            const authHeader = req.headers.get('Authorization');
            if (!authHeader) return respondError(401, 'Missing API key or Authorization header', 'unauthorized');
            const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await userClient.auth.getUser();
            if (authError || !user) return respondError(401, 'Unauthorized', 'unauthorized');

            const { searchParams } = new URL(req.url);
            projectId = searchParams.get('project_id');
            if (!projectId) return respondError(400, 'project_id query param is required for JWT-authenticated requests', 'missing_project_id');

            const accessError = await verifyJwtProjectAccess(adminClient, projectId, user.id);
            if (accessError) return accessError;
        }

        const { data: agents, error } = await adminClient
            .from('agents')
            .select('id, name, description, is_active, shadow_mode, created_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Agents API] Failed to list agents:', error);
            return respondError(500, 'Failed to list agents', 'list_failed');
        }

        return NextResponse.json({ data: agents || [] });
    } catch (error: unknown) {
        console.error('[Agents API] Error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return respondError(500, message, 'internal_error');
    }
}
