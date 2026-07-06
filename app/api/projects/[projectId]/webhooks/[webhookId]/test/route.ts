import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { deliverWebhook, createWebhookEvent } from '@/lib/webhooks/deliver';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

interface RouteParams {
    params: Promise<{ projectId: string; webhookId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
    const { projectId, webhookId } = await params;
    const supabase = await createServerClient();
    const supabaseAdmin = createAdminClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: webhook, error: webhookError } = await supabaseAdmin
        .from('webhooks')
        .select('id, name, url, secret, events, is_active, project_id')
        .eq('id', webhookId)
        .eq('project_id', projectId)
        .single();

    if (webhookError || !webhook) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const gate = await requireTierFeatureForProject(projectId, 'webhooks');
    if (gate) return gate;

    const testPayload = createWebhookEvent('test', projectId, {
        message: 'This is a test webhook delivery from Cencori',
        webhook_name: webhook.name,
        timestamp: new Date().toISOString(),
    });

    const result = await deliverWebhook(
        {
            id: webhook.id,
            name: webhook.name,
            url: webhook.url,
            secret: webhook.secret,
            events: webhook.events,
            is_active: webhook.is_active,
        },
        testPayload,
        1
    );

    if (result.success) {
        return NextResponse.json({
            success: true,
            message: 'Test webhook delivered successfully',
            statusCode: result.statusCode,
        });
    } else {
        return NextResponse.json({
            success: false,
            message: 'Test webhook delivery failed',
            error: result.error,
            statusCode: result.statusCode,
        }, { status: 400 });
    }
}
