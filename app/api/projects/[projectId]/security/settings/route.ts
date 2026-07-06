import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

interface SecuritySettings {
    filter_harmful_content: boolean;
    filter_pii: boolean;
    filter_nsfw: boolean;
    filter_jailbreaks: boolean;
    filter_prompt_injection: boolean;
    safety_threshold: number;
    ip_allowlist: string[] | null;
    audit_logging_enabled: boolean;
    alert_webhook_url: string | null;
    alert_on_critical: boolean;
    alert_on_high: boolean;
    alert_on_medium: boolean;
    alert_on_low: boolean;
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
        .select('id, organization_id, organizations!inner(owner_id)')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const gate = await requireTierFeatureForProject(projectId, 'securityIncidents');
    if (gate) return gate;

    const { data: settings, error: settingsError } = await supabase
        .from('security_settings')
        .select('*')
        .eq('project_id', projectId)
        .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    if (!settings) {
        return NextResponse.json({
            settings: {
                filter_harmful_content: true,
                filter_pii: true,
                filter_nsfw: true,
                filter_jailbreaks: true,
                filter_prompt_injection: true,
                safety_threshold: 0.7,
                ip_allowlist: null,
                audit_logging_enabled: true,
                alert_webhook_url: null,
                alert_on_critical: true,
                alert_on_high: true,
                alert_on_medium: false,
                alert_on_low: false,
            }
        });
    }

    return NextResponse.json({ settings });
}

export async function PUT(
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
        .select('id, organization_id, organizations!inner(owner_id)')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const gate = await requireTierFeatureForProject(projectId, 'securityIncidents');
    if (gate) return gate;

    const body: Partial<SecuritySettings> = await req.json();

    if (body.safety_threshold !== undefined) {
        if (body.safety_threshold < 0 || body.safety_threshold > 1) {
            return NextResponse.json({ error: 'Safety threshold must be between 0 and 1' }, { status: 400 });
        }
    }

    if (body.ip_allowlist !== undefined && body.ip_allowlist !== null) {
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
        for (const ip of body.ip_allowlist) {
            if (!ipRegex.test(ip)) {
                return NextResponse.json({ error: `Invalid IP format: ${ip}` }, { status: 400 });
            }
        }
    }

    const { data: settings, error: upsertError } = await supabase
        .from('security_settings')
        .upsert({
            project_id: projectId,
            ...body,
        }, {
            onConflict: 'project_id',
        })
        .select()
        .single();

    if (upsertError) {
        console.error('Error updating security settings:', upsertError);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }

    await supabase.from('security_audit_log').insert({
        project_id: projectId,
        event_type: 'settings_updated',
        actor_id: user.id,
        actor_email: user.email,
        details: { changes: body },
    });

    writeAuditLog({
        organizationId: project.organization_id,
        projectId,
        category: 'security',
        action: 'updated',
        resourceType: 'security_settings',
        resourceId: projectId,
        actorId: user.id,
        actorEmail: user.email || null,
        actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        actorType: 'user',
        description: 'Updated security settings',
        metadata: { changes: body },
    });

    return NextResponse.json({ settings });
}
