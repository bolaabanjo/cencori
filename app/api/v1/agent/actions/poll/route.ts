/**
 * Shadow Mode — Action Approval Polling
 * 
 * Agent clients poll this endpoint to check if their pending tool calls
 * have been approved or rejected by the user in the dashboard.
 * 
 * GET /api/v1/agent/actions/poll?ids=id1,id2,id3
 * 
 * Returns the status of each action:
 * - pending:  still waiting for user decision
 * - approved: user approved, safe to execute
 * - rejected: user rejected, do NOT execute
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";
import crypto from "crypto";
import { addGatewayHeaders } from "@/lib/gateway-middleware";
import { extractGatewayCallerIdentity, logApiGatewayRequest } from "@/lib/api-gateway-logs";
import { extractCencoriApiKeyFromHeaders } from "@/lib/api-keys";

export async function GET(req: NextRequest) {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const callerIdentity = extractGatewayCallerIdentity(req.headers);
    let apiLogContext: { projectId: string; apiKeyId: string; environment: string | null } | null = null;

    const respond = (response: NextResponse, errorCode?: string, errorMessage?: string) => {
        if (apiLogContext) {
            const forwardedFor = req.headers.get('x-forwarded-for');
            const clientIp = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip');

            void logApiGatewayRequest({
                projectId: apiLogContext.projectId,
                apiKeyId: apiLogContext.apiKeyId,
                requestId,
                endpoint: '/v1/agent/actions/poll',
                method: 'GET',
                statusCode: response.status,
                startedAt,
                environment: apiLogContext.environment,
                ipAddress: clientIp,
                countryCode: req.headers.get('x-vercel-ip-country') || req.headers.get('x-cencori-user-country'),
                userAgent: req.headers.get('user-agent'),
                callerOrigin: callerIdentity.callerOrigin,
                clientApp: callerIdentity.clientApp,
                errorCode: errorCode || null,
                errorMessage: errorMessage || null,
            });
        }

        return addGatewayHeaders(response, { requestId });
    };

    try {
        // ── Auth (API key for agents, or JWT for dashboard testing) ──
        const authHeader = req.headers.get("Authorization");
        const apiKey = extractCencoriApiKeyFromHeaders(req.headers);
        let authenticatedUserId: string | null = null;

        if (!apiKey && !authHeader) {
            return respond(
                NextResponse.json({ error: "Missing Authorization" }, { status: 401 }),
                'missing_authorization',
                'Missing Authorization header'
            );
        }

        if (apiKey) {
            // Quick key validation
            const adminClient = createAdminClient();
            const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
            const { data, error } = await adminClient
                .from('api_keys')
                .select('id, project_id, environment')
                .eq('key_hash', keyHash)
                .is('revoked_at', null)
                .single();
            if (error || !data) {
                return respond(
                    NextResponse.json({ error: "Invalid API Key" }, { status: 401 }),
                    'invalid_api_key',
                    'Invalid API key'
                );
            }

            apiLogContext = {
                projectId: data.project_id,
                apiKeyId: data.id,
                environment: data.environment || null,
            };
        } else if (authHeader) {
            const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await userClient.auth.getUser();
            if (authError || !user) {
                return respond(
                    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
                    'invalid_session',
                    'Invalid or expired user session'
                );
            }
            authenticatedUserId = user.id;
        }

        // ── Parse action IDs ──
        const idsParam = req.nextUrl.searchParams.get("ids");
        if (!idsParam) {
            return respond(
                NextResponse.json({ error: "Missing 'ids' query parameter" }, { status: 400 }),
                'missing_ids',
                "Missing 'ids' query parameter"
            );
        }

        const ids = Array.from(new Set(idsParam.split(",").map(id => id.trim()).filter(Boolean)));
        if (ids.length === 0 || ids.length > 20) {
            return respond(
                NextResponse.json({ error: "Provide 1-20 action IDs" }, { status: 400 }),
                'invalid_ids',
                'Provide 1-20 action IDs'
            );
        }

        // ── Fetch action statuses with project/org context ──
        const adminClient = createAdminClient();
        const { data: actions, error: fetchError } = await adminClient
            .from("agent_actions")
            .select(`
                id,
                status,
                payload,
                approved_at,
                agents!inner(
                    project_id,
                    projects!inner(
                        organization_id,
                        organizations!inner(owner_id)
                    )
                )
            `)
            .in("id", ids);

        if (fetchError) {
            return respond(
                NextResponse.json({ error: "Failed to fetch actions" }, { status: 500 }),
                'action_fetch_failed',
                fetchError.message
            );
        }

        type Relation<T> = T | T[] | null | undefined;
        const unwrapOne = <T>(value: Relation<T>): T | null => {
            if (!value) return null;
            return Array.isArray(value) ? (value[0] ?? null) : value;
        };

        const scopedActions = (actions || []).map((action) => {
            const agent = unwrapOne(action.agents as Relation<{ project_id: string; projects: Relation<{ organization_id: string; organizations: Relation<{ owner_id: string | null }> }> }>);
            const project = unwrapOne(agent?.projects);
            const organization = unwrapOne(project?.organizations);

            return {
                id: action.id,
                status: action.status,
                payload: action.payload,
                approved_at: action.approved_at,
                projectId: agent?.project_id || null,
                organizationId: project?.organization_id || null,
                organizationOwnerId: organization?.owner_id || null,
            };
        });

        if (scopedActions.length !== ids.length) {
            return respond(
                NextResponse.json({ error: 'One or more actions were not found' }, { status: 404 }),
                'action_not_found',
                'One or more actions were not found',
            );
        }

        if (apiLogContext) {
            const hasCrossProjectAction = scopedActions.some(
                (action) => action.projectId !== apiLogContext?.projectId
            );
            if (hasCrossProjectAction) {
                return respond(
                    NextResponse.json({ error: "Action does not belong to this project" }, { status: 403 }),
                    'action_project_scope_denied',
                    'Action does not belong to this project'
                );
            }
        } else if (authenticatedUserId) {
            const requestedOrgIds = Array.from(
                new Set(scopedActions.map((action) => action.organizationId).filter((orgId): orgId is string => !!orgId))
            );

            let memberOrgIds = new Set<string>();
            if (requestedOrgIds.length > 0) {
                const { data: memberships, error: membershipError } = await adminClient
                    .from('organization_members')
                    .select('organization_id')
                    .eq('user_id', authenticatedUserId)
                    .in('organization_id', requestedOrgIds);

                if (membershipError) {
                    return respond(
                        NextResponse.json({ error: "Failed to validate access" }, { status: 500 }),
                        'membership_check_failed',
                        membershipError.message
                    );
                }

                memberOrgIds = new Set(
                    (memberships || [])
                        .map((membership) => membership.organization_id)
                        .filter((orgId): orgId is string => !!orgId)
                );
            }

            const unauthorizedAction = scopedActions.find((action) => {
                if (!action.organizationId) return true;
                if (action.organizationOwnerId && action.organizationOwnerId === authenticatedUserId) return false;
                return !memberOrgIds.has(action.organizationId);
            });

            if (unauthorizedAction) {
                return respond(
                    NextResponse.json({ error: "Unauthorized to access one or more actions" }, { status: 403 }),
                    'action_scope_denied',
                    'User is not authorized to access one or more actions'
                );
            }
        }

        // Build response map
        const statusMap: Record<string, {
            status: string;
            approved_at: string | null;
            tool?: string;
        }> = {};

        for (const action of scopedActions) {
            statusMap[action.id] = {
                status: action.status,
                approved_at: action.approved_at,
                tool: action.payload?.tool,
            };
        }

        // Check if all are resolved (no longer pending)
        const allResolved = Object.values(statusMap).every(a => a.status !== 'pending');
        const anyRejected = Object.values(statusMap).some(a => a.status === 'rejected');

        return respond(NextResponse.json({
            actions: statusMap,
            all_resolved: allResolved,
            any_rejected: anyRejected,
            // If still pending, suggest a retry interval
            ...(allResolved ? {} : { retry_after_ms: 2000 }),
        }));

    } catch (error: unknown) {
        console.error("Poll Error:", error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return respond(
            NextResponse.json({ error: message }, { status: 500 }),
            'internal_error',
            message
        );
    }
}
