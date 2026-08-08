import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PlatformClient } from './client.js';
import { DocsClient } from './docs/client.js';
import type { McpConfig } from './config.js';
import {
    registerAgentsTools,
    registerAudioTools,
    registerDocsTools,
    registerGatewayTools,
    registerGovernanceTools,
    registerGuidanceTools,
    registerMemoryTools,
    registerMultimodalTools,
    registerSessionsTools,
    registerWebTools,
} from './tools.js';

const SERVER_NAME = 'cencori';
const SERVER_VERSION = '0.7.1';

export function createServer(config: McpConfig): McpServer {
    const server = new McpServer(
        {
            name: SERVER_NAME,
            version: SERVER_VERSION,
            websiteUrl: 'https://cencori.com/docs',
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    const { features, capabilities } = config;

    // Docs + guidance need no API key.
    if (features.docs) {
        const docs = new DocsClient(config.docsBaseUrl);
        registerDocsTools(server, docs, config.docsBaseUrl);
    }
    if (features.guidance) {
        registerGuidanceTools(server, config.baseUrl);
    }

    // Everything else needs a key. Reads register whenever a key is present;
    // multimodal inference is Write-tier (incurs cost) so it needs the flag.
    if (config.apiKey) {
        const client = new PlatformClient(config.baseUrl, config.apiKey);

        if (features.gateway) registerGatewayTools(server, client);
        if (features.agents) registerAgentsTools(server, client, capabilities);
        if (features.memory) registerMemoryTools(server, client, capabilities);
        if (features.sessions) registerSessionsTools(server, client, capabilities);
        if (features.web) registerWebTools(server, client, capabilities);
        if (features.governance) registerGovernanceTools(server, client, capabilities);

        if (features.multimodal && capabilities.write) {
            registerMultimodalTools(server, client);
            registerAudioTools(server, client);
        }
    }

    return server;
}
