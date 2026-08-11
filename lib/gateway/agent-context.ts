import { NextRequest, NextResponse } from 'next/server';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { GatewayContext } from '@/lib/gateway-middleware';
import { getCachedAgentConfig, setCachedAgentConfig } from '@/lib/config-cache';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type AgentResolution = {
    agentId: string;
    agentConfig: {
        model: string | null;
        system_prompt: string | null;
        tools: string[] | null;
    };
    shadowMode: boolean;
    gatewayCtx: GatewayContext;
};

type AgentResolveResult =
    | { ok: true; agent: AgentResolution }
    | { ok: false; response?: NextResponse; errorCode?: string; errorMessage?: string };

export type AgentKeyContext = {
    agentId: string | null;
    agentConfigModel: string | null;
    agentName: string | null;
};

/**
 * Load agent metadata for agent-scoped API keys (after gateway validation).
 * Uses the FK relationship from api_keys → agents to resolve identity.
 */
export async function loadAgentKeyContext(
    supabase: SupabaseAdmin,
    apiKeyId: string | null
): Promise<AgentKeyContext> {
    if (!apiKeyId) {
        return { agentId: null, agentConfigModel: null, agentName: null };
    }

    const { data, error } = await supabase
        .from('api_keys')
        .select(`
            agent_id,
            key_type,
            agents (
                id,
                name,
                is_active
            )
        `)
        .eq('id', apiKeyId)
        .single();

    if (error || !data) {
        return { agentId: null, agentConfigModel: null, agentName: null };
    }

    const agentId = data.agent_id as string | null;
    if (!agentId) {
        return { agentId: null, agentConfigModel: null, agentName: null };
    }

    const rawAgent = data.agents;
    const agent = Array.isArray(rawAgent) ? rawAgent[0] : rawAgent;
    if (agent && !agent.is_active) {
        throw new Error('AGENT_DISABLED');
    }

    let agentConfigModel: string | null = null;
    const { data: agentConfig } = await supabase
        .from('agent_configs')
        .select('model')
        .eq('agent_id', agentId)
        .single();

    if (agentConfig?.model) {
        agentConfigModel = agentConfig.model;
    }

    return {
        agentId,
        agentConfigModel,
        agentName: agent?.name ?? null,
    };
}

/**
 * Resolve agent identity from X-Agent-ID header or API key name, fetch config
 * with caching, validate project/org access, and optionally synthesize a
 * gateway context for dashboard (JWT) auth paths.
 *
 * Replaces ~170 lines of duplicated inline logic in chat/completions and responses routes.
 */
export async function resolveAgentContext(params: {
    supabase: SupabaseAdmin;
    req: NextRequest;
    gatewayCtx: GatewayContext | null;
    authenticatedProjectId: string | null;
    authenticatedUserId: string | null;
    startedAt: number;
    agentIdOverride?: string | null;
}): Promise<AgentResolveResult> {
    const { supabase, req, gatewayCtx, authenticatedProjectId, authenticatedUserId, startedAt } = params;
    let resolvedGatewayCtx = gatewayCtx;

    let agentId: string | null = params.agentIdOverride || req.headers.get("X-Agent-ID");

    // Derive agent ID from API key name (format: "Agent {uuid} Key")
    if (!agentId && resolvedGatewayCtx) {
        const { data: keyRecord } = await supabase
            .from("api_keys")
            .select("name")
            .eq("id", resolvedGatewayCtx.apiKeyId)
            .single();
        const match = keyRecord?.name?.match(/^Agent\s+(\S+)\s+Key/);
        if (match) agentId = match[1];
    }

    if (!agentId) {
        if (!authenticatedProjectId) {
            // Dashboard JWT auth requires an agent — no agent = error
            return {
                ok: false,
                response: NextResponse.json(
                    { error: "Missing X-Agent-ID for dashboard token auth. Use an API key for generic OpenAI-compatible requests." },
                    { status: 400 }
                ),
                errorCode: 'missing_agent_id_dashboard_auth',
            };
        }
        // API key requests without an agent are allowed (no agent features)
        return { ok: false, errorCode: 'agent_not_found' } as const;
    }

    // Fetch agent config with caching
    let config: Record<string, unknown> | null = null;
    const cached = await getCachedAgentConfig(agentId);
    if (cached) {
        config = cached.data;
    } else {
        const { data } = await supabase
            .from("agent_configs")
            .select(`*, agents!inner(id, project_id, is_active, shadow_mode)`)
            .eq("agent_id", agentId)
            .single();
        config = data as Record<string, unknown> | null;
        if (config) {
            await setCachedAgentConfig(agentId, config);
        }
    }

    if (!config) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Agent configuration not found. Create the agent in Cencori first." },
                { status: 404 }
            ),
            errorCode: 'agent_config_not_found',
        };
    }

    const agentRecord = config.agents as unknown as { id: string; project_id: string; is_active: boolean; shadow_mode: boolean };

    // Project scoping — API key path
    if (authenticatedProjectId && agentRecord.project_id !== authenticatedProjectId) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "API key does not have access to this agent" },
                { status: 403 }
            ),
            errorCode: 'agent_project_scope_denied',
        };
    }

    // Organization scoping — dashboard JWT path
    if (!authenticatedProjectId && authenticatedUserId) {
        const { data: agentProject } = await supabase
            .from("projects")
            .select(`id, organization_id, organizations!inner(owner_id)`)
            .eq("id", agentRecord.project_id)
            .single();

        if (!agentProject) {
            return {
                ok: false,
                response: NextResponse.json({ error: "Agent project not found" }, { status: 404 }),
                errorCode: 'agent_project_not_found',
            };
        }

        const ownerId = (agentProject.organizations as { owner_id?: string } | null)?.owner_id || null;
        let hasOrgAccess = ownerId === authenticatedUserId;
        if (!hasOrgAccess) {
            const { data: member } = await supabase
                .from('organization_members')
                .select('organization_id')
                .eq('organization_id', agentProject.organization_id)
                .eq('user_id', authenticatedUserId)
                .single();
            hasOrgAccess = !!member;
        }

        if (!hasOrgAccess) {
            return {
                ok: false,
                response: NextResponse.json({ error: "Unauthorized for this agent" }, { status: 403 }),
                errorCode: 'agent_org_scope_denied',
            };
        }

        // Synthesize gatewayCtx for dashboard requests
        const { data: dashboardKey } = await supabase
            .from('api_keys')
            .select('id, environment')
            .eq('project_id', agentRecord.project_id)
            .is('revoked_at', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        if (dashboardKey) {
            resolvedGatewayCtx = {
                supabase,
                projectId: agentRecord.project_id,
                organizationId: agentProject.organization_id,
                apiKeyId: dashboardKey.id,
                allowedModels: null,
                sponsoredModels: null,
                fullySponsoredKey: false,
                environment: dashboardKey.environment || 'production',
                keyType: 'dashboard',
                tier: 'free',
                requestId: crypto.randomUUID(),
                startTime: startedAt,
                clientIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '',
                countryCode: req.headers.get('x-vercel-ip-country') || null,
                projectName: '',
                defaultModel: null,
                defaultProvider: null,
                endUserBillingEnabled: false,
            };
        }
    }

    if (!agentRecord.is_active) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Agent is not active. Enable it from the dashboard." },
                { status: 403 }
            ),
            errorCode: 'agent_inactive',
        };
    }

    const cfg = config as { model?: string | null; system_prompt?: string | null; tools?: string[] | null };

    return {
        ok: true,
        agent: {
            agentId,
            agentConfig: {
                model: cfg.model ?? null,
                system_prompt: cfg.system_prompt ?? null,
                tools: cfg.tools ?? null,
            },
            shadowMode: agentRecord.shadow_mode,
            gatewayCtx: resolvedGatewayCtx!,
        },
    };
}
