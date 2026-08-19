/**
 * Security incidents are merged into the AI request logs feed (see
 * app/api/projects/[projectId]/logs/route.ts). They live in their own table, so
 * the list and detail endpoints share this module to map them onto the shape the
 * logs UI expects — otherwise clicking a blocked row 404s.
 */

export type LogStatus =
    | 'success'
    | 'success_fallback'
    | 'filtered'
    | 'blocked_output'
    | 'error'
    | 'rate_limited';

export interface SecurityIncidentRow {
    id: string;
    created_at: string;
    incident_type: string;
    severity: string;
    action_taken?: string | null;
    risk_score?: number | null;
    description?: string | null;
    input_text?: string | null;
    details?: Record<string, unknown> | null;
    api_key_id?: string | null;
}

export function mapIncidentTypeToStatus(
    incidentType: string,
    actionTaken?: string | null
): LogStatus {
    if (actionTaken === 'blocked' || incidentType === 'data_rule_block') {
        return 'blocked_output';
    }
    if (incidentType === 'rate_limit_exceeded') {
        return 'rate_limited';
    }
    return 'filtered';
}

/**
 * Reasons the guard gave, falling back to the human description and finally the
 * incident type, so the detail modal always has something to show.
 */
export function incidentReasons(incident: SecurityIncidentRow): string[] {
    const detailReasons = (incident.details as { reasons?: unknown } | null)?.reasons;
    if (Array.isArray(detailReasons) && detailReasons.length > 0) {
        return detailReasons.map(r => String(r));
    }
    if (incident.description) return [incident.description];
    return [incident.incident_type];
}

/**
 * Shape a security incident like an ai_requests detail row. The request payload
 * carries the offending input so users can see what tripped the guard.
 */
export function formatIncidentDetail(
    incident: SecurityIncidentRow,
    apiKey: { name: string; environment: string } | null
) {
    return {
        id: incident.id,
        created_at: incident.created_at,
        status: mapIncidentTypeToStatus(incident.incident_type, incident.action_taken),
        model: '—',

        request_payload: incident.input_text
            ? { messages: [{ role: 'user', content: incident.input_text }] }
            : null,
        response_payload: null,

        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        latency_ms: 0,

        // risk_score is a risk, not a safety score — leave safety N/A and let the
        // incident card below it report the risk.
        safety_score: undefined,
        error_message: incident.description || null,
        filtered_reasons: incidentReasons(incident),
        api_key: apiKey,
        security_incidents: [
            {
                id: incident.id,
                incident_type: incident.incident_type,
                severity: incident.severity,
                risk_score: incident.risk_score ?? 0,
            },
        ],
        evaluation_status: 'skipped' as const,
        evaluation_score: null,
        evaluation_details: null,
        evaluation_at: null,
        source: 'security_incident' as const,
    };
}
