import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

interface RouteParams {
    params: Promise<{
        projectId: string;
        ruleId: string;
    }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
    const { projectId, ruleId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const gate = await requireTierFeatureForProject(projectId, 'customDataRules');
    if (gate) return gate;
    const supabase = createAdminClient();

    try {
        const { data: rule, error } = await supabase
            .from('custom_data_rules')
            .select('*')
            .eq('id', ruleId)
            .eq('project_id', projectId)
            .single();

        if (error || !rule) {
            return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }

        return NextResponse.json({ rule });
    } catch (error) {
        console.error('[Custom Rules] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const { projectId, ruleId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const gate = await requireTierFeatureForProject(projectId, 'customDataRules');
    if (gate) return gate;
    const supabase = createAdminClient();

    try {
        const body = await req.json();
        const allowedFields = ['name', 'description', 'match_type', 'pattern', 'case_sensitive', 'action', 'is_active', 'priority'];

        const updates: Record<string, unknown> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updates[field] = body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        if (updates.match_type && !['keywords', 'regex', 'json_path', 'ai_detect'].includes(updates.match_type as string)) {
            return NextResponse.json(
                { error: 'Invalid match_type. Must be: keywords, regex, json_path, or ai_detect' },
                { status: 400 }
            );
        }

        if (updates.action && !['mask', 'redact', 'block', 'tokenize'].includes(updates.action as string)) {
            return NextResponse.json(
                { error: 'Invalid action. Must be: mask, redact, block, or tokenize' },
                { status: 400 }
            );
        }

        if (updates.match_type === 'regex' && updates.pattern) {
            try {
                new RegExp(updates.pattern as string);
            } catch {
                return NextResponse.json({ error: 'Invalid regex pattern' }, { status: 400 });
            }
        }

        const { data: rule, error } = await supabase
            .from('custom_data_rules')
            .update(updates)
            .eq('id', ruleId)
            .eq('project_id', projectId)
            .select()
            .single();

        if (error) {
            console.error('[Custom Rules] Failed to update:', error);
            return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
        }

        if (!rule) {
            return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }

        const { data: proj } = await supabase.from('projects').select('organization_id').eq('id', projectId).single();
        if (proj?.organization_id) {
            writeAuditLog({
                organizationId: proj.organization_id,
                projectId,
                category: 'security',
                action: 'updated',
                resourceType: 'custom_rule',
                resourceId: ruleId,
                actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
                description: `Custom rule updated: ${rule.name}`,
                metadata: { updatedFields: Object.keys(updates) },
            });
        }

        return NextResponse.json({ rule });
    } catch (error) {
        console.error('[Custom Rules] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { projectId, ruleId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const gate = await requireTierFeatureForProject(projectId, 'customDataRules');
    if (gate) return gate;
    const supabase = createAdminClient();

    try {
        const { error } = await supabase
            .from('custom_data_rules')
            .delete()
            .eq('id', ruleId)
            .eq('project_id', projectId);

        if (error) {
            console.error('[Custom Rules] Failed to delete:', error);
            return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
        }

        const { data: proj } = await supabase.from('projects').select('organization_id').eq('id', projectId).single();
        if (proj?.organization_id) {
            writeAuditLog({
                organizationId: proj.organization_id,
                projectId,
                category: 'security',
                action: 'deleted',
                resourceType: 'custom_rule',
                resourceId: ruleId,
                actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
                description: `Custom rule deleted: ${ruleId}`,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Custom Rules] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
