import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import { jsonResult, READ_ONLY_ANNOTATIONS } from './shared.js';

export function registerAgentsTools(server: McpServer, client: PlatformClient): void {
    server.registerTool(
        'list_agents',
        {
            title: 'List Cencori agents',
            description: 'List agents available to the authenticated project.',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => {
            const agents = await client.listAgents();
            return jsonResult(agents);
        },
    );

    server.registerTool(
        'get_agent',
        {
            title: 'Get Cencori agent',
            description: 'Fetch the full configuration for one Cencori agent by ID.',
            inputSchema: {
                agent_id: z.string().min(1).describe('The agent ID to fetch.'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ agent_id }) => {
            const agent = await client.getAgent(agent_id);
            return jsonResult(agent);
        },
    );
}
