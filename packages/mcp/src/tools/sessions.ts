import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import { jsonResult, READ_ONLY_ANNOTATIONS } from './shared.js';

/**
 * Agent session read tools. Write tools (create/turn) and destructive tools
 * (delete/approve/reject) are added in Phase 2 behind the capability flags.
 */
export function registerSessionsTools(server: McpServer, client: PlatformClient): void {
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
}
