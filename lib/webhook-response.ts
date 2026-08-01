export function normalizeWebhookResponse<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];

    if (payload && typeof payload === 'object' && 'webhooks' in payload) {
        const webhooks = (payload as { webhooks?: unknown }).webhooks;
        return Array.isArray(webhooks) ? webhooks as T[] : [];
    }

    return [];
}
