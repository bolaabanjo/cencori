import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import type { McpCapabilities } from '../config.js';
import { jsonResult, READ_ONLY_ANNOTATIONS, WRITE_ANNOTATIONS, DESTRUCTIVE_ANNOTATIONS } from './shared.js';

const agentConfigShape = z
    .object({
        model: z.string().optional(),
        system_prompt: z.string().optional(),
        tools: z.array(z.string()).optional(),
        temperature: z.number().min(0).max(2).optional(),
    })
    .optional()
    .describe('Agent runtime config: model, system_prompt, tools, temperature.');

export function registerAgentsTools(server: McpServer, client: PlatformClient, caps: McpCapabilities): void {
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

    server.registerTool(
        'poll_agent_actions',
        {
            title: 'Poll pending agent actions',
            description: 'Poll for pending actions queued for agents in the authenticated project.',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => jsonResult(await client.get('/v1/agent/actions/poll')),
    );

    if (caps.write) {
        server.registerTool(
            'create_agent',
            {
                title: 'Create an agent',
                description: 'Create a new agent in a project.',
                inputSchema: {
                    project_id: z.string().min(1).describe('The project id to create the agent in.'),
                    name: z.string().min(1).describe('Agent name.'),
                    description: z.string().optional(),
                    config: agentConfigShape,
                },
                annotations: WRITE_ANNOTATIONS,
            },
            async ({ project_id, name, description, config }) =>
                jsonResult(await client.post('/v1/agents', { project_id, name, description, config })),
        );

        server.registerTool(
            'update_agent',
            {
                title: 'Update an agent',
                description: 'Update an agent’s name, description, status, shadow mode, or config.',
                inputSchema: {
                    agent_id: z.string().min(1).describe('The agent id to update.'),
                    name: z.string().optional(),
                    description: z.string().optional(),
                    is_active: z.boolean().optional(),
                    shadow_mode: z.boolean().optional(),
                    config: agentConfigShape,
                },
                annotations: WRITE_ANNOTATIONS,
            },
            async ({ agent_id, name, description, is_active, shadow_mode, config }) =>
                jsonResult(
                    await client.patch(`/v1/agents/${agent_id}`, {
                        name,
                        description,
                        is_active,
                        shadow_mode,
                        config,
                    }),
                ),
        );
    }

    if (caps.destructive) {
        server.registerTool(
            'delete_agent',
            {
                title: 'Delete an agent',
                description: 'Permanently delete an agent by id. This cannot be undone.',
                inputSchema: { agent_id: z.string().min(1).describe('The agent id to delete.') },
                annotations: DESTRUCTIVE_ANNOTATIONS,
            },
            async ({ agent_id }) => jsonResult(await client.del(`/v1/agents/${agent_id}`)),
        );
    }
}
