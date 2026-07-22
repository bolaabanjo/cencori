import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;

    try {
        const body = await req.json();
        const { format = 'csv', filters } = body;

        let query = supabaseAdmin
            .from('ai_requests')
            .select('*')
            .eq('project_id', projectId);

        if (filters?.status && filters.status !== 'all') {
            query = query.eq('status', filters.status);
        }

        if (filters?.model && filters.model !== 'all') {
            query = query.eq('model', filters.model);
        }

        if (filters?.time_range && filters.time_range !== 'all') {
            const now = new Date();
            let startTime: Date;

            switch (filters.time_range) {
                case '1h':
                    startTime = new Date(now.getTime() - 60 * 60 * 1000);
                    break;
                case '24h':
                    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            }

            query = query.gte('created_at', startTime.toISOString());
        }

        query = query
            .order('created_at', { ascending: false })
            .limit(10000);

        const { data: requests, error } = await query;

        if (error) {
            console.error('[Export API] Error fetching requests:', error);
            return NextResponse.json(
                { error: 'Failed to export request logs' },
                { status: 500 }
            );
        }

        if (!requests || requests.length === 0) {
            return NextResponse.json(
                { error: 'No requests found for the given filters' },
                { status: 404 }
            );
        }

        if (format === 'csv') {
            const headers = [
                'ID',
                'Timestamp',
                'Status',
                'Model',
                'Prompt Tokens',
                'Completion Tokens',
                'Total Tokens',
                'Cost (USD)',
                'Latency (ms)',
                'Safety Score',
                'Error Message',
                'Filtered Reasons',
            ];

            const csvRows = [headers.join(',')];

            requests.forEach(req => {
                const row = [
                    req.id,
                    req.created_at,
                    req.status,
                    req.model,
                    req.prompt_tokens || 0,
                    req.completion_tokens || 0,
                    req.total_tokens || 0,
                    req.cost_usd || 0,
                    req.latency_ms || 0,
                    req.safety_score || '-',
                    req.error_message ? `"${req.error_message.replace(/"/g, '""')}"` : '-',
                    req.filtered_reasons ? `"${req.filtered_reasons.join('; ').replace(/"/g, '""')}"` : '-',
                ];
                csvRows.push(row.join(','));
            });

            const csv = csvRows.join('\n');
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `cencori-logs-${timestamp}.csv`;

            return new NextResponse(csv, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                },
            });

        } else if (format === 'json') {
            const exportData = {
                export_date: new Date().toISOString(),
                project_id: projectId,
                filters: filters || {},
                total_records: requests.length,
                requests: requests.map(req => ({
                    id: req.id,
                    created_at: req.created_at,
                    status: req.status,
                    model: req.model,
                    prompt_tokens: req.prompt_tokens,
                    completion_tokens: req.completion_tokens,
                    total_tokens: req.total_tokens,
                    cost_usd: req.cost_usd,
                    latency_ms: req.latency_ms,
                    safety_score: req.safety_score,
                    error_message: req.error_message,
                    filtered_reasons: req.filtered_reasons,
                    request_payload: req.request_payload,
                    response_payload: req.response_payload,
                })),
            };

            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `cencori-logs-${timestamp}.json`;

            return new NextResponse(JSON.stringify(exportData, null, 2), {
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                },
            });
        }

        return NextResponse.json(
            { error: 'Invalid format. Use "csv" or "json"' },
            { status: 400 }
        );

    } catch (error) {
        console.error('[Export API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
