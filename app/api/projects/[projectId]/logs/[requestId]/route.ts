import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { fetchRagMetricsResult } from '@/lib/integrations/ragmetrics';
import { formatIncidentDetail } from '@/lib/security-incident-log';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; requestId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId, requestId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;

    try {
        const { data: request, error } = await supabaseAdmin
            .from('ai_requests')
            .select('*')
            .eq('id', requestId)
            .eq('project_id', projectId)
            .single();

        if (error || !request) {
            // The logs feed also lists security incidents, which live in their own
            // table and never produced an ai_requests row (blocked before the
            // provider call). Fall back to those before giving up.
            const { data: incident } = await supabaseAdmin
                .from('security_incidents')
                .select('*')
                .eq('id', requestId)
                .eq('project_id', projectId)
                .single();

            if (incident) {
                let incidentKeyInfo = null;
                if (incident.api_key_id) {
                    const { data: keyData } = await supabaseAdmin
                        .from('api_keys')
                        .select('name, environment')
                        .eq('id', incident.api_key_id)
                        .single();

                    if (keyData) {
                        incidentKeyInfo = {
                            name: keyData.name,
                            environment: keyData.environment,
                        };
                    }
                }

                return NextResponse.json(formatIncidentDetail(incident, incidentKeyInfo));
            }

            return NextResponse.json(
                { error: 'Request not found' },
                { status: 404 }
            );
        }

        // Just-in-time RagMetrics polling:
        // If evaluation is pending and we have a run_id, fetch the result now.
        let evalStatus = request.evaluation_status;
        let evalScore = request.evaluation_score;
        let evalDetails = request.evaluation_details;
        let evalAt = request.evaluation_at;

        if (evalStatus === 'pending' && evalDetails?.run_id) {
            try {
                const pollResult = await fetchRagMetricsResult({
                    projectId,
                    requestId,
                    runId: evalDetails.run_id,
                });

                if (pollResult.status === 'completed') {
                    evalStatus = 'completed';
                    evalScore = pollResult.score;
                    evalDetails = pollResult.details;
                    evalAt = new Date().toISOString();
                }
                // If still pending, we just return the current state
            } catch (pollErr) {
                console.warn('[Request Detail] RagMetrics poll failed:', pollErr);
                // Don't fail the request — just return current state
            }
        }

        let apiKeyInfo = null;
        if (request.api_key_id) {
            const { data: keyData } = await supabaseAdmin
                .from('api_keys')
                .select('name, environment')
                .eq('id', request.api_key_id)
                .single();

            if (keyData) {
                apiKeyInfo = {
                    name: keyData.name,
                    environment: keyData.environment,
                };
            }
        }

        const { data: incidents } = await supabaseAdmin
            .from('security_incidents')
            .select('id, incident_type, severity, risk_score, details')
            .eq('ai_request_id', requestId);

        const detailedResponse = {
            id: request.id,
            created_at: request.created_at,
            status: request.status,
            model: request.model,

            request_payload: request.request_payload,
            response_payload: request.response_payload,

            prompt_tokens: request.prompt_tokens,
            completion_tokens: request.completion_tokens,
            total_tokens: request.total_tokens,
            cost_usd: request.cost_usd,
            latency_ms: request.latency_ms,

            safety_score: request.safety_score,
            error_message: request.error_message,
            filtered_reasons: request.filtered_reasons,
            api_key: apiKeyInfo,
            security_incidents: incidents || [],
            evaluation_status: evalStatus,
            evaluation_score: evalScore,
            evaluation_details: evalDetails,
            evaluation_at: evalAt,
        };

        return NextResponse.json(detailedResponse);

    } catch (error) {
        console.error('[Request Detail API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
