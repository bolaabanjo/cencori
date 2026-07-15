import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { validateGatewayRequest, handleCorsPreFlight, type GatewayContext } from '@/lib/gateway-middleware';
import { extractCencoriApiKeyFromHeaders } from '@/lib/api-keys';
import { invalidateAgentConfig } from '@/lib/config-cache';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const respondError = (status: number, message: string, code = 'invalid_request_error') =>
    NextResponse.json(
        { error: { message, type: 'invalid_request_error', code }, status: 'failed' },
        { status }
    );

async function resolveProjectForAgent(
    adminClient: ReturnType<typeof createAdminClient>,
    agentId: string,
    userId: string | null,
    gatewayCtx: GatewayContext | null
): Promise<{ projectId: string; orgId: string } | NextResponse> {
    const { data: agent, error } = await adminClient
        .from('agents')
        .select('id, project_id, projects!inner(organization_id)')
        .eq('id', agentId)
        .single();

    if (error || !agent) return respondError(404, 'Agent not found', 'agent_not_found');

    const agentProject = agent.projects as unknown as { organization_id: string };
    const projectId = agent.project_id;
    const orgId = agentProject.organization_id;

    if (gatewayCtx) {
        if (gatewayCtx.projectId !== projectId) {
            return respondError(403, 'API key does not have access to this agent', 'forbidden');
        }
        return { projectId, orgId };
    }

    if (userId) {
        const { data: userProject } = await adminClient
            .from('projects')
            .select(`id, organizations!inner(owner_id)`)
            .eq('id', projectId)
            .single();

        if (!userProject) return respondError(404, 'Project not found', 'project_not_found');

        const ownerId = (userProject.organizations as { owner_id?: string }).owner_id;
        let hasAccess = ownerId === userId;
        if (!hasAccess) {
            const { data: member } = await adminClient
                .from('organization_members')
                .select('id')
                .eq('organization_id', orgId)
                .eq('user_id', userId)
                .single();
            hasAccess = !!member;
        }

        if (!hasAccess) return respondError(403, 'Unauthorized for this agent', 'forbidden');
        return { projectId, orgId };
    }

    return respondError(401, 'Unauthorized', 'unauthorized');
}

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
) {
    try {
        const { agentId } = await params;
        const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);
        const adminClient = createAdminClient();
        let gatewayCtx: GatewayContext | null = null;
        let userId: string | null = null;

        if (providedApiKey) {
            const validation = await validateGatewayRequest(req);
            if (!validation.success) return validation.response;
            if (validation.context.keyType !== 'secret') {
                return respondError(403, 'Agent management requires a secret API key', 'secret_key_required');
            }
            gatewayCtx = validation.context;
        } else {
            const authHeader = req.headers.get('Authorization');
            if (!authHeader) return respondError(401, 'Missing API key or Authorization header', 'unauthorized');
            const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await userClient.auth.getUser();
            if (authError || !user) return respondError(401, 'Unauthorized', 'unauthorized');
            userId = user.id;
        }

        const access = await resolveProjectForAgent(adminClient, agentId, userId, gatewayCtx);
        if (access instanceof NextResponse) return access;

        const { data: agent, error } = await adminClient
            .from('agents')
            .select('id, name, description, is_active, shadow_mode, created_at, updated_at')
            .eq('id', agentId)
            .single();

        if (error || !agent) return respondError(404, 'Agent not found', 'agent_not_found');

        const { data: agentConfig } = await adminClient
            .from('agent_configs')
            .select('model, system_prompt, tools, temperature')
            .eq('agent_id', agentId)
            .single();

        return NextResponse.json({
            id: agent.id,
            name: agent.name,
            description: agent.description,
            is_active: agent.is_active,
            shadow_mode: agent.shadow_mode,
            created_at: agent.created_at,
            updated_at: agent.updated_at,
            config: {
                model: agentConfig?.model ?? null,
                system_prompt: agentConfig?.system_prompt ?? null,
                tools: agentConfig?.tools ?? [],
                temperature: agentConfig?.temperature ?? null,
            },
        });
    } catch (error: unknown) {
        console.error('[Agents API] Error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return respondError(500, message, 'internal_error');
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
) {
    try {
        const { agentId } = await params;
        const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);
        const adminClient = createAdminClient();
        let gatewayCtx: GatewayContext | null = null;
        let userId: string | null = null;

        if (providedApiKey) {
            const validation = await validateGatewayRequest(req);
            if (!validation.success) return validation.response;
            if (validation.context.keyType !== 'secret') {
                return respondError(403, 'Agent management requires a secret API key', 'secret_key_required');
            }
            gatewayCtx = validation.context;
        } else {
            const authHeader = req.headers.get('Authorization');
            if (!authHeader) return respondError(401, 'Missing API key or Authorization header', 'unauthorized');
            const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await userClient.auth.getUser();
            if (authError || !user) return respondError(401, 'Unauthorized', 'unauthorized');
            userId = user.id;
        }

        const access = await resolveProjectForAgent(adminClient, agentId, userId, gatewayCtx);
        if (access instanceof NextResponse) return access;

        const body = await req.json() as {
            name?: string;
            description?: string;
            is_active?: boolean;
            shadow_mode?: boolean;
            config?: {
                model?: string;
                system_prompt?: string;
                tools?: string[];
                temperature?: number;
            };
        };

        if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
            return respondError(400, 'name must be a non-empty string', 'invalid_name');
        }
        if (body.description !== undefined && typeof body.description !== 'string') {
            return respondError(400, 'description must be a string', 'invalid_description');
        }
        if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
            return respondError(400, 'is_active must be a boolean', 'invalid_is_active');
        }
        if (body.shadow_mode !== undefined && typeof body.shadow_mode !== 'boolean') {
            return respondError(400, 'shadow_mode must be a boolean', 'invalid_shadow_mode');
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

        const agentUpdate: Record<string, unknown> = {};
        if (body.name !== undefined) agentUpdate.name = body.name.trim();
        if (body.description !== undefined) agentUpdate.description = body.description?.trim() || null;
        if (body.is_active !== undefined) agentUpdate.is_active = body.is_active;
        if (body.shadow_mode !== undefined) agentUpdate.shadow_mode = body.shadow_mode;

        if (Object.keys(agentUpdate).length > 0) {
            const { error: updateError } = await adminClient
                .from('agents')
                .update(agentUpdate)
                .eq('id', agentId);

            if (updateError) {
                console.error('[Agents API] Failed to update agent:', updateError);
                return respondError(500, 'Failed to update agent', 'update_failed');
            }
        }

        if (body.config) {
            const { model, system_prompt, tools, temperature } = body.config;
            const configUpdate: Record<string, unknown> = {};
            if (model !== undefined) configUpdate.model = model;
            if (system_prompt !== undefined) configUpdate.system_prompt = system_prompt;
            if (tools !== undefined) configUpdate.tools = tools;
            if (temperature !== undefined) configUpdate.temperature = temperature;

            if (Object.keys(configUpdate).length > 0) {
                const { error: configError } = await adminClient
                    .from('agent_configs')
                    .update(configUpdate)
                    .eq('agent_id', agentId);

                if (configError) {
                    console.error('[Agents API] Failed to update agent config:', configError);
                    return respondError(500, 'Failed to update agent configuration', 'config_update_failed');
                }
            }
        }

        if (Object.keys(agentUpdate).length > 0 || body.config) {
            await invalidateAgentConfig(agentId);
        }

        const { data: agent } = await adminClient
            .from('agents')
            .select('id, name, description, is_active, shadow_mode, created_at, updated_at')
            .eq('id', agentId)
            .single();

        const { data: agentConfig } = await adminClient
            .from('agent_configs')
            .select('model, system_prompt, tools, temperature')
            .eq('agent_id', agentId)
            .single();

        return NextResponse.json({
            id: agent!.id,
            name: agent!.name,
            description: agent!.description,
            is_active: agent!.is_active,
            shadow_mode: agent!.shadow_mode,
            created_at: agent!.created_at,
            updated_at: agent!.updated_at,
            config: {
                model: agentConfig?.model ?? null,
                system_prompt: agentConfig?.system_prompt ?? null,
                tools: agentConfig?.tools ?? [],
                temperature: agentConfig?.temperature ?? null,
            },
        });
    } catch (error: unknown) {
        console.error('[Agents API] Error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return respondError(500, message, 'internal_error');
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
) {
    try {
        const { agentId } = await params;
        const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);
        const adminClient = createAdminClient();
        let gatewayCtx: GatewayContext | null = null;
        let userId: string | null = null;

        if (providedApiKey) {
            const validation = await validateGatewayRequest(req);
            if (!validation.success) return validation.response;
            if (validation.context.keyType !== 'secret') {
                return respondError(403, 'Agent management requires a secret API key', 'secret_key_required');
            }
            gatewayCtx = validation.context;
        } else {
            const authHeader = req.headers.get('Authorization');
            if (!authHeader) return respondError(401, 'Missing API key or Authorization header', 'unauthorized');
            const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await userClient.auth.getUser();
            if (authError || !user) return respondError(401, 'Unauthorized', 'unauthorized');
            userId = user.id;
        }

        const access = await resolveProjectForAgent(adminClient, agentId, userId, gatewayCtx);
        if (access instanceof NextResponse) return access;

        const { error: deleteError } = await adminClient
            .from('agents')
            .delete()
            .eq('id', agentId);

        if (deleteError) {
            console.error('[Agents API] Failed to delete agent:', deleteError);
            return respondError(500, 'Failed to delete agent', 'delete_failed');
        }

        await invalidateAgentConfig(agentId);

        return new NextResponse(null, { status: 204 });
    } catch (error: unknown) {
        console.error('[Agents API] Error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return respondError(500, message, 'internal_error');
    }
}
