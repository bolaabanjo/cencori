/**
 * Webhook Trigger Utility
 *
 * Sends webhook notifications for project events
 */

import { createAdminClient } from '@/lib/supabaseAdmin';
import crypto from 'crypto';
import { safeOutboundFetch } from '@/lib/security/outbound-url';

interface WebhookPayload {
    event: string;
    timestamp: string;
    project_id: string;
    data: Record<string, unknown>;
}

interface WebhookConfig {
    id: string;
    url: string;
    secret?: string;
    events: string[];
    is_active: boolean;
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
    return crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
}

/**
 * Trigger webhooks for a specific event
 */
export async function triggerWebhook(
    projectId: string,
    event: string,
    data: Record<string, unknown>
): Promise<void> {
    const supabase = createAdminClient();

    try {
        // Fetch active webhooks for this project that listen to this event
        const { data: webhooks, error } = await supabase
            .from('webhooks')
            .select('id, url, secret, events, is_active')
            .eq('project_id', projectId)
            .eq('is_active', true)
            .contains('events', [event]);

        if (error || !webhooks || webhooks.length === 0) {
            return; // No webhooks to trigger
        }

        const payload: WebhookPayload = {
            event,
            timestamp: new Date().toISOString(),
            project_id: projectId,
            data,
        };

        const payloadString = JSON.stringify(payload);

        // Send to all matching webhooks (non-blocking)
        const webhookPromises = webhooks.map(async (webhook: WebhookConfig) => {
            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'X-Webhook-Event': event,
                    'X-Webhook-Timestamp': payload.timestamp,
                };

                // Add signature if secret is configured
                if (webhook.secret) {
                    headers['X-Webhook-Signature'] = generateSignature(payloadString, webhook.secret);
                }

                const response = await safeOutboundFetch(webhook.url, {
                    method: 'POST',
                    headers,
                    body: payloadString,
                    signal: AbortSignal.timeout(10000), // 10 second timeout
                }, { maxRedirects: 0 });

                const currentData = await supabase
                    .from('webhooks')
                    .select('failure_count')
                    .eq('id', webhook.id)
                    .single();

                if (response.ok) {
                    // Success - reset failure count and update last_triggered_at
                    await supabase
                        .from('webhooks')
                        .update({
                            failure_count: 0,
                            last_triggered_at: new Date().toISOString(),
                        })
                        .eq('id', webhook.id);
                } else {
                    // Failed - increment failure count
                    const currentCount = (currentData?.data?.failure_count as number) || 0;
                    await supabase
                        .from('webhooks')
                        .update({
                            failure_count: currentCount + 1,
                        })
                        .eq('id', webhook.id);

                    console.warn(`[Webhook] Failed to deliver to ${webhook.url}:`, response.status);
                }
            } catch (error) {
                // Network error - increment failure count
                console.error(`[Webhook] Error sending to ${webhook.url}:`, error);

                try {
                    const currentData = await supabase
                        .from('webhooks')
                        .select('failure_count')
                        .eq('id', webhook.id)
                        .single();
                    const currentCount = (currentData?.data?.failure_count as number) || 0;
                    await supabase
                        .from('webhooks')
                        .update({
                            failure_count: currentCount + 1,
                        })
                        .eq('id', webhook.id);
                } catch (innerError) {
                    console.error('[Webhook] Failed to update failure count:', innerError);
                }
            }
        });

        // Fire and forget - don't block the main request
        Promise.allSettled(webhookPromises).catch(console.error);

    } catch (error) {
        console.error('[Webhook] Error fetching webhooks:', error);
    }
}

/**
 * Trigger model.fallback webhook event
 */
export async function triggerFallbackWebhook(
    projectId: string,
    data: {
        original_provider: string;
        original_model: string;
        fallback_provider: string;
        fallback_model: string;
        reason: string;
        request_id?: string;
    }
): Promise<void> {
    await triggerWebhook(projectId, 'model.fallback', data);
}

/**
 * Trigger request.failed webhook event
 */
export async function triggerRequestFailedWebhook(
    projectId: string,
    data: {
        provider: string;
        model: string;
        error: string;
        request_id?: string;
    }
): Promise<void> {
    await triggerWebhook(projectId, 'request.failed', data);
}

/**
 * Trigger security.violation webhook event
 */
export async function triggerSecurityWebhook(
    projectId: string,
    data: {
        incident_type: string;
        severity: string;
        description: string;
        end_user_id?: string;
    }
): Promise<void> {
    await triggerWebhook(projectId, 'security.violation', data);
}
