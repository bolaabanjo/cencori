import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; incidentId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId, incidentId } = await params;

    const gate = await requireTierFeatureForProject(projectId, 'securityIncidents');
    if (gate) return gate;

    try {
        const { data: incident, error } = await supabaseAdmin
            .from('security_incidents')
            .select('*')
            .eq('id', incidentId)
            .eq('project_id', projectId)
            .single();

        if (error || !incident) {
            return NextResponse.json(
                { error: 'Incident not found' },
                { status: 404 }
            );
        }

        let relatedRequest = null;
        if (incident.ai_request_id) {
            const { data: requestData } = await supabaseAdmin
                .from('ai_requests')
                .select('id, created_at, status, model, request_payload, response_payload')
                .eq('id', incident.ai_request_id)
                .single();

            if (requestData) {
                let requestPreview = '';
                try {
                    const messages = requestData.request_payload?.messages;
                    if (messages && messages.length > 0) {
                        requestPreview = (messages[0].content || messages[0].text || '').substring(0, 200);
                    }
                } catch (e) {
                    requestPreview = '';
                }

                relatedRequest = {
                    id: requestData.id,
                    created_at: requestData.created_at,
                    status: requestData.status,
                    model: requestData.model,
                    preview: requestPreview,
                };
            }
        }

        return NextResponse.json({
            ...incident,
            related_request: relatedRequest,
        });

    } catch (error) {
        console.error('[Incident Detail API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; incidentId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId, incidentId } = await params;

    const gate = await requireTierFeatureForProject(projectId, 'securityIncidents');
    if (gate) return gate;

    try {
        const body = await req.json();
        const { reviewed, review_notes } = body;

        const updateData: Record<string, unknown> = {};

        if (typeof reviewed === 'boolean') {
            updateData.reviewed = reviewed;
            if (reviewed) {
                updateData.reviewed_at = new Date().toISOString();
            }
        }

        if (review_notes !== undefined) {
            updateData.review_notes = review_notes;
        }

        const { error } = await supabaseAdmin
            .from('security_incidents')
            .update(updateData)
            .eq('id', incidentId)
            .eq('project_id', projectId);

        if (error) {
            console.error('[Incident Update API] Error:', error);
            return NextResponse.json(
                { error: 'Failed to update incident' },
                { status: 500 }
            );
        }

        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('organization_id')
            .eq('id', projectId)
            .single();

        writeAuditLog({
            organizationId: project?.organization_id || '',
            projectId,
            category: 'security',
            action: 'reviewed',
            resourceType: 'security_incident',
            resourceId: incidentId,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: `Reviewed security incident ${incidentId}`,
            metadata: { reviewed, review_notes },
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[Incident Update API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
