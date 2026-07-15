import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import crypto from 'crypto';
import { trackEvent } from '@/lib/track-event';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';
import { assertSafeOutboundUrl } from '@/lib/security/outbound-url';

interface WebhookBody {
    name: string;
    url: string;
    events?: string[];
    secret?: string;
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

    const gate = await requireTierFeatureForProject(projectId, 'webhooks');
    if (gate) return gate;

    const { data: webhooks, error: webhooksError } = await supabase
        .from('webhooks')
        .select('id, name, url, events, is_active, created_at, last_triggered_at, failure_count')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (webhooksError) {
        return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
    }

    return NextResponse.json({ webhooks });
}

export async function POST(
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

    const gate = await requireTierFeatureForProject(projectId, 'webhooks');
    if (gate) return gate;

    const body: WebhookBody = await req.json();

    if (!body.name || !body.url) {
        return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
    }
    try {
        await assertSafeOutboundUrl(body.url);
    } catch {
        return NextResponse.json({ error: 'Webhook URL must resolve to a public HTTP or HTTPS destination' }, { status: 400 });
    }

    const secret = body.secret || crypto.randomBytes(32).toString('hex');

    const { data: webhook, error: createError } = await supabase
        .from('webhooks')
        .insert({
            project_id: projectId,
            name: body.name,
            url: body.url,
            events: body.events || ['request.completed'],
            secret,
            is_active: true,
        })
        .select('id, name, url, events, is_active, created_at, secret')
        .single();

    if (createError) {
        console.error('Error creating webhook:', createError);
        return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
    }

    trackEvent({ event_type: 'webhook.created', product: 'gateway', user_id: user.id, project_id: projectId, metadata: { webhook_name: body.name, events: body.events } });

    writeAuditLog({
        organizationId: project.organization_id,
        projectId,
        category: 'webhook',
        action: 'created',
        resourceType: 'webhook',
        resourceId: webhook.id,
        actorId: user.id,
        actorEmail: user.email || null,
        actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        actorType: 'user',
        description: `Created webhook "${body.name}" for ${body.url}`,
        metadata: { webhook_name: body.name, url: body.url, events: webhook.events },
    });

    return NextResponse.json({ webhook }, { status: 201 });
}
