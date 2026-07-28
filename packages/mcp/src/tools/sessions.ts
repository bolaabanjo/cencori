import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import type { McpCapabilities } from '../config.js';
import { jsonResult, READ_ONLY_ANNOTATIONS, WRITE_ANNOTATIONS, DESTRUCTIVE_ANNOTATIONS } from './shared.js';

/**
 * Agent session tools. Reads always register; create/turn need
 * CENCORI_MCP_WRITE; delete/approve/reject need CENCORI_MCP_DESTRUCTIVE.
 */
export function registerSessionsTools(server: McpServer, client: PlatformClient, caps: McpCapabilities): void {
    server.registerTool(
        'list_sessions',
        {
            title: 'List agent sessions',
            description: 'List agent sessions for the project, optionally filtered by status or agent.',
            inputSchema: {
                status: z.string().optional().describe('Filter by session status.'),
                agent_id: z.string().optional().describe('Filter by agent id.'),
                page: z.number().int().positive().optional(),
                limit: z.number().int().positive().max(100).optional(),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ status, agent_id, page, limit }) =>
            jsonResult(
                await client.get('/v1/sessions', {
                    status,
                    agent_id,
                    page: page?.toString(),
                    limit: limit?.toString(),
                }),
            ),
    );

    server.registerTool(
        'get_session',
        {
            title: 'Get an agent session',
            description: 'Fetch one agent session by id.',
            inputSchema: { session_id: z.string().min(1).describe('The session id.') },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ session_id }) => jsonResult(await client.get(`/v1/sessions/${session_id}`)),
    );

    server.registerTool(
        'get_session_events',
        {
            title: 'Get agent session events',
            description: 'List the event timeline for one agent session.',
            inputSchema: { session_id: z.string().min(1).describe('The session id.') },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ session_id }) => jsonResult(await client.get(`/v1/sessions/${session_id}/events`)),
    );

    if (caps.write) {
        server.registerTool(
            'create_session',
            {
                title: 'Create an agent session',
                description: 'Start a new session for an agent.',
                inputSchema: {
                    agent_id: z.string().min(1).describe('The agent id to start a session for.'),
                    metadata: z.record(z.string(), z.unknown()).optional().describe('Optional session metadata.'),
                },
                annotations: WRITE_ANNOTATIONS,
            },
            async ({ agent_id, metadata }) => jsonResult(await client.post('/v1/sessions', { agent_id, metadata })),
        );

        server.registerTool(
            'add_session_turn',
            {
                title: 'Add a turn to a session',
                description: 'Run a turn in an agent session. Incurs usage/cost.',
                inputSchema: {
                    session_id: z.string().min(1).describe('The session id.'),
                    model: z.string().min(1).describe('Model id for the turn.'),
                    input: z.string().min(1).describe('The user input for this turn.'),
                    instructions: z.string().optional().describe('Optional system instructions.'),
                    temperature: z.number().min(0).max(2).optional(),
                },
                annotations: WRITE_ANNOTATIONS,
            },
            async ({ session_id, model, input, instructions, temperature }) =>
                jsonResult(
                    await client.post(`/v1/sessions/${session_id}/turns`, {
                        model,
                        input,
                        instructions,
                        temperature,
                    }),
                ),
        );
    }

    if (caps.destructive) {
        server.registerTool(
            'delete_session',
            {
                title: 'Delete an agent session',
                description: 'Permanently delete an agent session by id. This cannot be undone.',
                inputSchema: { session_id: z.string().min(1).describe('The session id to delete.') },
                annotations: DESTRUCTIVE_ANNOTATIONS,
            },
            async ({ session_id }) => jsonResult(await client.del(`/v1/sessions/${session_id}`)),
        );

        server.registerTool(
            'approve_session',
            {
                title: 'Approve a pending session action',
                description: 'Approve a pending action in an agent session (human-in-the-loop).',
                inputSchema: {
                    session_id: z.string().min(1).describe('The session id.'),
                    action_id: z.string().optional().describe('Specific pending action id, if any.'),
                },
                annotations: DESTRUCTIVE_ANNOTATIONS,
            },
            async ({ session_id, action_id }) =>
                jsonResult(await client.post(`/v1/sessions/${session_id}/approve`, { action_id })),
        );

        server.registerTool(
            'reject_session',
            {
                title: 'Reject a pending session action',
                description: 'Reject a pending action in an agent session (human-in-the-loop).',
                inputSchema: {
                    session_id: z.string().min(1).describe('The session id.'),
                    action_id: z.string().optional().describe('Specific pending action id, if any.'),
                },
                annotations: DESTRUCTIVE_ANNOTATIONS,
            },
            async ({ session_id, action_id }) =>
                jsonResult(await client.post(`/v1/sessions/${session_id}/reject`, { action_id })),
        );
    }
}
