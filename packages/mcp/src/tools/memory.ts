import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import { jsonResult, READ_ONLY_ANNOTATIONS } from './shared.js';

/**
 * Memory read tools. Write tools (remember/write/delete/namespace) are added in
 * Phase 2 behind the write/destructive capability flags.
 */

const scopeShape = {
    namespace: z.string().optional().describe('Memory namespace to scope to.'),
    scope: z.string().optional().describe('Memory scope (e.g. project, user, session).'),
    user_id: z.string().optional().describe('Scope to a specific end-user id.'),
    session_id: z.string().optional().describe('Scope to a specific session id.'),
};

export function registerMemoryTools(server: McpServer, client: PlatformClient): void {
    server.registerTool(
        'list_memories',
        {
            title: 'List memories',
            description: 'List stored memories for the project, optionally scoped by namespace/user/session.',
            inputSchema: {
                ...scopeShape,
                limit: z.number().int().positive().max(200).optional(),
                cursor: z.string().optional().describe('Pagination cursor from a previous response.'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ namespace, scope, user_id, session_id, limit, cursor }) =>
            jsonResult(
                await client.get('/v1/memory/list', {
                    namespace,
                    scope,
                    userId: user_id,
                    sessionId: session_id,
                    limit: limit?.toString(),
                    cursor,
                }),
            ),
    );

    server.registerTool(
        'search_memory',
        {
            title: 'Search memory (semantic)',
            description: 'Semantically search stored memories by query.',
            inputSchema: {
                query: z.string().min(1).describe('Natural-language search query.'),
                ...scopeShape,
                top_k: z.number().int().positive().max(100).optional().describe('Max results.'),
                threshold: z.number().min(0).max(1).optional().describe('Similarity threshold.'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ query, namespace, scope, user_id, session_id, top_k, threshold }) =>
            jsonResult(
                await client.post('/v1/memory/search', {
                    query,
                    namespace,
                    scope,
                    userId: user_id,
                    sessionId: session_id,
                    topK: top_k,
                    threshold,
                }),
            ),
    );

    server.registerTool(
        'get_memory',
        {
            title: 'Get a memory',
            description: 'Fetch a single memory by id.',
            inputSchema: { memory_id: z.string().min(1).describe('The memory id.') },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ memory_id }) => jsonResult(await client.get(`/v1/memory/${memory_id}`)),
    );

    server.registerTool(
        'list_memory_entities',
        {
            title: 'List memory entities',
            description: 'List entities resolved from the memory graph.',
            inputSchema: scopeShape,
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ namespace, scope, user_id, session_id }) =>
            jsonResult(
                await client.get('/v1/memory/entities', {
                    namespace,
                    scope,
                    userId: user_id,
                    sessionId: session_id,
                }),
            ),
    );

    server.registerTool(
        'get_memory_graph',
        {
            title: 'Get memory entity graph',
            description: 'Traverse the memory entity graph from an optional starting entity.',
            inputSchema: {
                ...scopeShape,
                entity: z.string().optional().describe('Entity to start traversal from.'),
                hops: z.number().int().positive().max(5).optional().describe('Traversal depth.'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ namespace, scope, user_id, session_id, entity, hops }) =>
            jsonResult(
                await client.get('/v1/memory/graph', {
                    namespace,
                    scope,
                    userId: user_id,
                    sessionId: session_id,
                    entity,
                    hops: hops?.toString(),
                }),
            ),
    );

    server.registerTool(
        'get_forget_suggestions',
        {
            title: 'Get forget suggestions',
            description: 'List memories the system suggests forgetting (stale/superseded).',
            inputSchema: scopeShape,
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ namespace, scope, user_id, session_id }) =>
            jsonResult(
                await client.get('/v1/memory/forget-suggestions', {
                    namespace,
                    scope,
                    userId: user_id,
                    sessionId: session_id,
                }),
            ),
    );
}
