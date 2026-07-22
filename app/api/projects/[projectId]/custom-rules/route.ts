import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { trackEvent } from '@/lib/track-event';
import { writeAuditLog } from '@/lib/audit-log';

interface RouteParams {
    params: Promise<{
        projectId: string;
    }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const supabase = createAdminClient();

    try {
        const { data: rules, error } = await supabase
            .from('custom_data_rules')
            .select('*')
            .eq('project_id', projectId)
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Custom Rules] Failed to fetch:', error);
            return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
        }

        return NextResponse.json({ rules });
    } catch (error) {
        console.error('[Custom Rules] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const supabase = createAdminClient();

    try {
        const body = await req.json();
        const { name, description, match_type, pattern, case_sensitive, action, priority } = body;

        if (!name || !match_type || !pattern || !action) {
            return NextResponse.json(
                { error: 'Missing required fields: name, match_type, pattern, action' },
                { status: 400 }
            );
        }

        if (!['keywords', 'regex', 'json_path', 'ai_detect'].includes(match_type)) {
            return NextResponse.json(
                { error: 'Invalid match_type. Must be: keywords, regex, json_path, or ai_detect' },
                { status: 400 }
            );
        }

        if (!['mask', 'redact', 'block', 'tokenize'].includes(action)) {
            return NextResponse.json(
                { error: 'Invalid action. Must be: mask, redact, block, or tokenize' },
                { status: 400 }
            );
        }

        if (match_type === 'regex') {
            try {
                new RegExp(pattern);
            } catch {
                return NextResponse.json({ error: 'Invalid regex pattern' }, { status: 400 });
            }
        }

        const { data: rule, error } = await supabase
            .from('custom_data_rules')
            .insert({
                project_id: projectId,
                name,
                description: description || null,
                match_type,
                pattern,
                case_sensitive: case_sensitive ?? false,
                action,
                priority: priority ?? 0,
                is_active: true,
            })
            .select()
            .single();

        if (error) {
            console.error('[Custom Rules] Failed to create:', error);
            return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
        }

        trackEvent({ event_type: 'custom_rule.created', product: 'gateway', project_id: projectId, metadata: { rule_name: name, match_type, action } });

        const { data: proj } = await supabase.from('projects').select('organization_id').eq('id', projectId).single();
        if (proj?.organization_id) {
            writeAuditLog({
                organizationId: proj.organization_id,
                projectId,
                category: 'security',
                action: 'created',
                resourceType: 'custom_rule',
                resourceId: rule.id,
                actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
                description: `Custom rule created: ${name}`,
                metadata: { ruleName: name, matchType: match_type, action },
            });
        }

        return NextResponse.json({ rule }, { status: 201 });
    } catch (error) {
        console.error('[Custom Rules] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
