const DEFAULT_BASE_URL = 'https://cencori.com';

export type McpFeature =
    | 'docs'
    | 'gateway'
    | 'agents'
    | 'memory'
    | 'sessions'
    | 'multimodal'
    | 'governance'
    | 'guidance';

const KNOWN_FEATURES: readonly McpFeature[] = [
    'docs',
    'gateway',
    'agents',
    'memory',
    'sessions',
    'multimodal',
    'governance',
    'guidance',
];

/**
 * Action tiers the server is allowed to expose. Reads are always available
 * (given a key); writes and destructive actions are opt-in via env.
 */
export interface McpCapabilities {
    /** Non-destructive writes + inference. CENCORI_MCP_WRITE. */
    write: boolean;
    /** Deletes and approvals. CENCORI_MCP_DESTRUCTIVE (implies write). */
    destructive: boolean;
}

export interface McpConfig {
    docsBaseUrl: string;
    baseUrl: string;
    apiKey?: string;
    capabilities: McpCapabilities;
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

function allFeaturesEnabled(): Record<McpFeature, boolean> {
    return {
        docs: true,
        gateway: true,
        agents: true,
        memory: true,
        sessions: true,
        multimodal: true,
        governance: true,
        guidance: true,
    };
}

function parseFeatures(value: string | undefined): Record<McpFeature, boolean> {
    if (!value || value.trim() === '') {
        return allFeaturesEnabled();
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
        memory: enabled.has('memory'),
        sessions: enabled.has('sessions'),
        multimodal: enabled.has('multimodal'),
        governance: enabled.has('governance'),
        guidance: enabled.has('guidance'),
    };
}

export function loadConfig(): McpConfig {
    const docsBaseUrl = normalizeBaseUrl(process.env.CENCORI_DOCS_BASE_URL ?? DEFAULT_BASE_URL);
    const baseUrl = normalizeBaseUrl(process.env.CENCORI_BASE_URL ?? DEFAULT_BASE_URL);
    const apiKey = process.env.CENCORI_API_KEY?.trim() || undefined;
    const features = parseFeatures(process.env.CENCORI_MCP_FEATURES);

    // Destructive implies write. Both default off — reads-only unless opted in.
    const destructive = parseBooleanEnv(process.env.CENCORI_MCP_DESTRUCTIVE, false);
    const write = destructive || parseBooleanEnv(process.env.CENCORI_MCP_WRITE, false);

    return {
        docsBaseUrl,
        baseUrl,
        apiKey,
        capabilities: { write, destructive },
        features,
    };
}
