const DEFAULT_BASE_URL = 'https://cencori.com';

export type McpFeature = 'docs' | 'gateway' | 'agents';

export interface McpConfig {
    docsBaseUrl: string;
    baseUrl: string;
    apiKey?: string;
    readOnly: boolean;
    features: Record<McpFeature, boolean>;
}

function normalizeBaseUrl(value: string): string {
    return value.replace(/\/$/, '');
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) {
        return defaultValue;
    }

    return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function parseFeatures(value: string | undefined): Record<McpFeature, boolean> {
    const allFeatures: Record<McpFeature, boolean> = {
        docs: true,
        gateway: true,
        agents: true,
    };

    if (!value || value.trim() === '') {
        return allFeatures;
    }

    const enabled = new Set(
        value
            .split(',')
            .map((feature) => feature.trim().toLowerCase())
            .filter((feature): feature is McpFeature =>
                feature === 'docs' || feature === 'gateway' || feature === 'agents',
            ),
    );

    return {
        docs: enabled.has('docs'),
        gateway: enabled.has('gateway'),
        agents: enabled.has('agents'),
    };
}

export function loadConfig(): McpConfig {
    const docsBaseUrl = normalizeBaseUrl(process.env.CENCORI_DOCS_BASE_URL ?? DEFAULT_BASE_URL);
    const baseUrl = normalizeBaseUrl(process.env.CENCORI_BASE_URL ?? DEFAULT_BASE_URL);
    const apiKey = process.env.CENCORI_API_KEY?.trim() || undefined;
    const readOnly = parseBooleanEnv(process.env.CENCORI_MCP_READ_ONLY, true);
    const features = parseFeatures(process.env.CENCORI_MCP_FEATURES);

    return {
        docsBaseUrl,
        baseUrl,
        apiKey,
        readOnly,
        features,
    };
}
