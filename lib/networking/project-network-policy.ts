import type { SupabaseClient } from '@supabase/supabase-js';
import { getCachedNetworkConfig, setCachedNetworkConfig } from '@/lib/config-cache';
import { isIpAllowed } from '@/lib/networking/cidr';

export type ProjectNetworkAccessMode = 'public' | 'restricted';

export interface ProjectNetworkPolicy {
    accessMode: ProjectNetworkAccessMode;
    allowedCidrs: string[];
}

export const DEFAULT_PROJECT_NETWORK_POLICY: ProjectNetworkPolicy = {
    accessMode: 'public',
    allowedCidrs: [],
};

interface ProjectNetworkPolicyRow {
    access_mode: ProjectNetworkAccessMode;
    allowed_cidrs: string[] | null;
}

function fromRow(row: ProjectNetworkPolicyRow | null): ProjectNetworkPolicy {
    if (!row) return DEFAULT_PROJECT_NETWORK_POLICY;
    return {
        accessMode: row.access_mode,
        allowedCidrs: Array.isArray(row.allowed_cidrs) ? row.allowed_cidrs : [],
    };
}

export async function loadProjectNetworkPolicy(
    supabase: SupabaseClient,
    projectId: string
): Promise<ProjectNetworkPolicy> {
    const cached = await getCachedNetworkConfig<ProjectNetworkPolicy>(projectId);
    if (cached?.data) return cached.data;

    const { data, error } = await supabase
        .from('project_network_policies')
        .select('access_mode, allowed_cidrs')
        .eq('project_id', projectId)
        .maybeSingle();

    if (error) {
        throw new Error(`Unable to load project network policy: ${error.message}`);
    }

    const policy = fromRow(data as ProjectNetworkPolicyRow | null);
    void setCachedNetworkConfig(projectId, policy);
    return policy;
}

export function isProjectIngressAllowed(
    policy: ProjectNetworkPolicy,
    sourceIp: string | null
): boolean {
    if (policy.accessMode === 'public') return true;
    if (!sourceIp) return false;
    return isIpAllowed(sourceIp, policy.allowedCidrs);
}
