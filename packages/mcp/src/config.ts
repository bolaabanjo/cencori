const DEFAULT_BASE_URL = 'https://cencori.com';

export type McpFeature = 'docs' | 'gateway' | 'agents';

const KNOWN_FEATURES: readonly McpFeature[] = ['docs', 'gateway', 'agents'];

export interface McpConfig {
    docsBaseUrl: string;
    baseUrl: string;
    apiKey?: string;
    /**
     * Placeholder for future write-tool gating.
     * v1 has no write tools; this flag is parsed but not used for registration.
     * Defaults to true. Setting false logs a warning at startup.
     */
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

function isMcpFeature(value: string): value is McpFeature {
    return (KNOWN_FEATURES as readonly string[]).includes(value);
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

    const tokens = value
        .split(',')
        .map((feature) => feature.trim().toLowerCase())
        .filter(Boolean);

    const unrecognized = tokens.filter((token) => !isMcpFeature(token));
    if (unrecognized.length > 0) {
        console.error(
            `[cencori-mcp] Ignoring unrecognized CENCORI_MCP_FEATURES value(s): ${unrecognized.join(', ')}. ` +
                `Known features: ${KNOWN_FEATURES.join(', ')}.`,
        );
    }

    const enabled = new Set(tokens.filter(isMcpFeature));

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

    if (!readOnly) {
        console.error(
            '[cencori-mcp] CENCORI_MCP_READ_ONLY=false has no effect yet: v1 has no write tools. ' +
                'This flag is reserved for future write gating.',
        );
    }

    return {
        docsBaseUrl,
        baseUrl,
        apiKey,
        readOnly,
        features,
    };
}
