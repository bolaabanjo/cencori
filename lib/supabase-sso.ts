// Supabase SSO admin helpers using the REST API directly
// The JS SDK may not expose typed SSO methods, so we call the GoTrue API

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const GOTRUE_URL = `${SUPABASE_URL}/auth/v1`;

async function gotrueAdmin(path: string, options: RequestInit = {}) {
    const res = await fetch(`${GOTRUE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
            ...options.headers,
        },
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
        const msg = body?.message || body?.error || body?.msg || `GoTrue error ${res.status}`;
        throw new Error(msg);
    }

    return body;
}

export interface SSOProvider {
    id: string;
    saml?: {
        metadata_url?: string;
        entity_id?: string;
        attribute_mapping?: Record<string, string>;
    };
    domains?: { domain: string }[];
    created_at?: string;
    updated_at?: string;
}

export async function createSSOProvider(params: {
    type: "saml";
    metadata_url?: string;
    metadata_xml?: string;
    domains: string[];
    attribute_mapping?: Record<string, string>;
}): Promise<SSOProvider> {
    return gotrueAdmin("/admin/sso/providers", {
        method: "POST",
        body: JSON.stringify(params),
    });
}

export async function updateSSOProvider(
    providerId: string,
    params: {
        metadata_url?: string;
        metadata_xml?: string;
        domains?: string[];
        attribute_mapping?: Record<string, string>;
    }
): Promise<SSOProvider> {
    return gotrueAdmin(`/admin/sso/providers/${providerId}`, {
        method: "PUT",
        body: JSON.stringify(params),
    });
}

export async function getSSOProvider(providerId: string): Promise<SSOProvider> {
    return gotrueAdmin(`/admin/sso/providers/${providerId}`);
}

export async function listSSOProviders(): Promise<{ items: SSOProvider[] }> {
    return gotrueAdmin("/admin/sso/providers");
}

export async function deleteSSOProvider(providerId: string): Promise<SSOProvider> {
    return gotrueAdmin(`/admin/sso/providers/${providerId}`, {
        method: "DELETE",
    });
}
