import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PlatformClient } from './client.js';
import { DocsClient } from './docs/client.js';
import type { McpConfig } from './config.js';
import {
    registerAgentsTools,
    registerDocsTools,
    registerGatewayTools,
} from './tools.js';

const SERVER_NAME = 'cencori';
const SERVER_VERSION = '0.1.0';

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

    if (config.features.docs) {
        const docs = new DocsClient(config.docsBaseUrl);
        registerDocsTools(server, docs, config.docsBaseUrl);
    }

    if (config.apiKey && (config.features.gateway || config.features.agents)) {
        const client = new PlatformClient(config.baseUrl, config.apiKey);

        if (config.features.gateway) {
            registerGatewayTools(server, client);
        }

        if (config.features.agents) {
            registerAgentsTools(server, client);
        }
    }

    return server;
}
