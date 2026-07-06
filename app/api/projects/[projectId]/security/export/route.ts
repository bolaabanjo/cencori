import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

const EVENT_LABELS: Record<string, string> = {
    settings_updated: 'Settings Updated',
    api_key_created: 'API Key Created',
    api_key_deleted: 'API Key Deleted',
    api_key_rotated: 'API Key Rotated',
    webhook_created: 'Webhook Created',
    webhook_deleted: 'Webhook Deleted',
    incident_reviewed: 'Incident Reviewed',
    ip_blocked: 'IP Blocked',
    rate_limit_exceeded: 'Rate Limit Exceeded',
    auth_failed: 'Auth Failed',
    content_filter: 'Content Blocked',
    intent_analysis: 'Intent Blocked',
    jailbreak: 'Jailbreak Attempt',
    prompt_injection: 'Prompt Injection',
    output_leakage: 'Output Leakage',
    pii_input: 'PII Detected (Input)',
    pii_output: 'PII Detected (Output)',
    data_rule_block: 'Data Rule Blocked',
    data_rule_mask: 'Data Masked',
    data_rule_redact: 'Data Redacted',
    data_rule_tokenize: 'Data Tokenized',
};

function escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const supabase = await createServerClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const gate = await requireTierFeatureForProject(projectId, 'auditTrails');
    if (gate) return gate;

    const url = new URL(req.url);
    const eventType = url.searchParams.get('event_type');
    const timeRange = url.searchParams.get('time_range') || '7d';

    let startDate = new Date();
    switch (timeRange) {
        case '1h':   startDate = new Date(Date.now() - 60 * 60 * 1000); break;
        case '24h':  startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); break;
        case '7d':   startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
        case '30d':  startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
        case 'all':  startDate = new Date(0); break;
    }

    const securityIncidentTypes = ['content_filter', 'intent_analysis', 'jailbreak', 'prompt_injection', 'output_leakage', 'pii_input', 'pii_output'];
    const adminEventTypes = ['settings_updated', 'api_key_created', 'api_key_deleted', 'api_key_rotated', 'webhook_created', 'webhook_deleted', 'incident_reviewed', 'ip_blocked', 'rate_limit_exceeded', 'auth_failed'];

    const allLogs: Array<{
        id: string;
        event_type: string;
        actor_email: string | null;
        actor_ip: string | null;
        details: Record<string, unknown>;
        created_at: string;
    }> = [];

    if (!eventType || eventType === 'all' || securityIncidentTypes.includes(eventType)) {
        let query = supabase
            .from('security_incidents')
            .select('*')
            .eq('project_id', projectId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(5000);

        if (eventType && eventType !== 'all' && securityIncidentTypes.includes(eventType)) {
            query = query.eq('incident_type', eventType);
        }

        const { data: incidents } = await query;
        if (incidents) {
            for (const incident of incidents) {
                allLogs.push({
                    id: incident.id,
                    event_type: incident.incident_type,
                    actor_email: null,
                    actor_ip: null,
                    details: {
                        severity: incident.severity,
                        description: incident.description,
                        action_taken: incident.action_taken,
                        risk_score: incident.risk_score,
                        ...(incident.details && typeof incident.details === 'object' ? incident.details : {}),
                    },
                    created_at: incident.created_at,
                });
            }
        }
    }

    if (!eventType || eventType === 'all' || adminEventTypes.includes(eventType)) {
        let query = supabase
            .from('security_audit_log')
            .select('*')
            .eq('project_id', projectId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(5000);

        if (eventType && eventType !== 'all' && adminEventTypes.includes(eventType)) {
            query = query.eq('event_type', eventType);
        }

        const { data: auditLogs } = await query;
        if (auditLogs) {
            for (const log of auditLogs) {
                allLogs.push({
                    id: log.id,
                    event_type: log.event_type,
                    actor_email: log.actor_email,
                    actor_ip: log.actor_ip,
                    details: log.details || {},
                    created_at: log.created_at,
                });
            }
        }
    }

    allLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const rows: string[] = [
        ['Timestamp', 'Event', 'Actor', 'IP Address', 'Details'].join(','),
    ];

    for (const log of allLogs) {
        const timestamp = new Date(log.created_at).toISOString();
        const event = EVENT_LABELS[log.event_type] || log.event_type;
        const actor = log.actor_email || 'System';
        const ip = log.actor_ip || '-';
        const details = Object.keys(log.details).length > 0
            ? JSON.stringify(log.details)
            : '-';

        rows.push([
            escapeCSV(timestamp),
            escapeCSV(event),
            escapeCSV(actor),
            escapeCSV(ip),
            escapeCSV(details),
        ].join(','));
    }

    const csv = rows.join('\n');
    const filename = `security-audit-${project.name?.toLowerCase().replace(/\s+/g, '-') || projectId}-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csv, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    });
}
