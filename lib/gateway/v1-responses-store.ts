import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { ResponsesResponse } from './v1-responses-execute';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const TTL_MS = 30 * 60 * 1000;

export async function storeResponse(
    supabase: SupabaseAdmin,
    projectId: string,
    organizationId: string,
    response: ResponsesResponse,
): Promise<void> {
    const { error } = await supabase.from('gateway_responses').upsert({
        id: response.id,
        project_id: projectId,
        organization_id: organizationId,
        response,
        expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    });
    if (error) throw new Error(`Failed to persist response: ${error.message}`);
}

export async function getResponse(
    supabase: SupabaseAdmin,
    projectId: string,
    id: string,
): Promise<ResponsesResponse | null> {
    const { data, error } = await supabase
        .from('gateway_responses')
        .select('response, expires_at')
        .eq('id', id)
        .eq('project_id', projectId)
        .maybeSingle();

    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) {
        void supabase.from('gateway_responses').delete().eq('id', id).eq('project_id', projectId);
        return null;
    }
    return data.response as ResponsesResponse;
}
