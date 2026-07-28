import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import type { McpCapabilities } from '../config.js';
import { jsonResult, READ_ONLY_ANNOTATIONS, WRITE_ANNOTATIONS, DESTRUCTIVE_ANNOTATIONS } from './shared.js';

/**
 * Memory tools. Reads are always registered; writes need CENCORI_MCP_WRITE and
 * deletes need CENCORI_MCP_DESTRUCTIVE.
 *
 * Memory is scoped to a user or a session (the only scopes today). Scoped tools
 * therefore require `user_id` (user scope, the default) or `session_id`
 * (session scope) — a bare call has no scope key and the API rejects it.
 */

const scopeShape = {
    namespace: z.string().optional().describe('Memory namespace to scope to.'),
    scope: z.enum(['user', 'session']).optional().describe('Memory scope. Defaults to "user".'),
    user_id: z.string().optional().describe('End-user id. REQUIRED for user scope (the default).'),
    session_id: z.string().optional().describe('Session id. REQUIRED for session scope.'),
};

type ScopeArgs = { scope?: 'user' | 'session'; user_id?: string; session_id?: string };

/** Returns a clear error message if the required scope key is missing, else null. */
function missingScopeKey({ scope, user_id, session_id }: ScopeArgs): string | null {
    if ((scope ?? 'user') === 'session') {
        return session_id || user_id ? null : 'session_id (or user_id) is required for session scope.';
    }
    return user_id
        ? null
        : 'user_id is required for user scope (the default). Pass user_id, or use scope="session" with session_id.';
}

const scopeErr = (msg: string) => jsonResult({ error: 'missing_scope', message: msg });

export function registerMemoryTools(server: McpServer, client: PlatformClient, caps: McpCapabilities): void {
    server.registerTool(
        'list_memories',
        {
            title: 'List memories',
            description: 'List stored memories for a user or session. Requires user_id (or session_id for session scope).',
            inputSchema: {
                ...scopeShape,
                limit: z.number().int().positive().max(100).optional(),
                cursor: z.string().optional().describe('Pagination cursor from a previous response.'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ namespace, scope, user_id, session_id, limit, cursor }) => {
            const err = missingScopeKey({ scope, user_id, session_id });
            if (err) return scopeErr(err);
            return jsonResult(
                await client.get('/v1/memory/list', {
                    namespace,
                    scope,
                    userId: user_id,
                    sessionId: session_id,
                    limit: limit?.toString(),
                    cursor,
                }),
            );
        },
    );

    server.registerTool(
        'search_memory',
        {
            title: 'Search memory (semantic)',
            description: 'Semantically search a user’s or session’s memories. Requires user_id (or session_id for session scope).',
            inputSchema: {
                query: z.string().min(1).describe('Natural-language search query.'),
                ...scopeShape,
                top_k: z.number().int().positive().max(100).optional().describe('Max results.'),
                threshold: z.number().min(0).max(1).optional().describe('Similarity threshold.'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ query, namespace, scope, user_id, session_id, top_k, threshold }) => {
            const err = missingScopeKey({ scope, user_id, session_id });
            if (err) return scopeErr(err);
            return jsonResult(
                await client.post('/v1/memory/search', {
                    query,
                    namespace,
                    scope,
                    userId: user_id,
                    sessionId: session_id,
                    topK: top_k,
                    threshold,
                }),
            );
        },
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
            description: 'List entities resolved from a user’s or session’s memory graph. Requires user_id (or session_id).',
            inputSchema: scopeShape,
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ namespace, scope, user_id, session_id }) => {
            const err = missingScopeKey({ scope, user_id, session_id });
            if (err) return scopeErr(err);
            return jsonResult(
                await client.get('/v1/memory/entities', { namespace, scope, userId: user_id, sessionId: session_id }),
            );
        },
    );

    server.registerTool(
        'get_memory_graph',
        {
            title: 'Get memory entity graph',
            description: 'Traverse a user’s or session’s memory entity graph. Requires user_id (or session_id).',
            inputSchema: {
                ...scopeShape,
                entity: z.string().optional().describe('Entity to start traversal from.'),
                hops: z.number().int().positive().max(5).optional().describe('Traversal depth.'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ namespace, scope, user_id, session_id, entity, hops }) => {
            const err = missingScopeKey({ scope, user_id, session_id });
            if (err) return scopeErr(err);
            return jsonResult(
                await client.get('/v1/memory/graph', {
                    namespace,
                    scope,
                    userId: user_id,
                    sessionId: session_id,
                    entity,
                    hops: hops?.toString(),
                }),
            );
        },
    );

    server.registerTool(
        'get_forget_suggestions',
        {
            title: 'Get forget suggestions',
            description: 'List memories the system suggests forgetting for a user or session. Requires user_id (or session_id).',
            inputSchema: scopeShape,
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ namespace, scope, user_id, session_id }) => {
            const err = missingScopeKey({ scope, user_id, session_id });
            if (err) return scopeErr(err);
            return jsonResult(
                await client.get('/v1/memory/forget-suggestions', {
                    namespace,
                    scope,
                    userId: user_id,
                    sessionId: session_id,
                }),
            );
        },
    );

    if (caps.write) {
        server.registerTool(
            'remember_memory',
            {
                title: 'Remember a conversation turn',
                description:
                    'Store a user/assistant exchange as memory. Requires user_id (or session_id for session scope).',
                inputSchema: {
                    user: z.string().min(1).describe('The user message.'),
                    assistant: z.string().min(1).describe('The assistant response.'),
                    ...scopeShape,
                },
                annotations: WRITE_ANNOTATIONS,
            },
            async ({ user, assistant, namespace, scope, user_id, session_id }) => {
                const err = missingScopeKey({ scope, user_id, session_id });
                if (err) return scopeErr(err);
                return jsonResult(
                    await client.post('/v1/memory/remember', {
                        user,
                        assistant,
                        namespace,
                        scope,
                        userId: user_id,
                        sessionId: session_id,
                    }),
                );
            },
        );

        server.registerTool(
            'write_memory',
            {
                title: 'Write a memory',
                description: 'Store a single memory (a fact/note). Requires user_id (or session_id for session scope).',
                inputSchema: {
                    content: z.string().min(1).describe('The memory content to store.'),
                    importance: z.number().min(0).max(1).optional().describe('Importance weight 0–1.'),
                    ...scopeShape,
                },
                annotations: WRITE_ANNOTATIONS,
            },
            async ({ content, importance, namespace, scope, user_id, session_id }) => {
                const err = missingScopeKey({ scope, user_id, session_id });
                if (err) return scopeErr(err);
                return jsonResult(
                    await client.post('/v1/memory/write', {
                        content,
                        importance,
                        namespace,
                        scope,
                        userId: user_id,
                        sessionId: session_id,
                    }),
                );
            },
        );

        server.registerTool(
            'create_namespace',
            {
                title: 'Create a memory namespace',
                description: 'Create a new memory namespace.',
                inputSchema: {
                    name: z.string().min(1).describe('Namespace name.'),
                    description: z.string().optional(),
                    embedding_model: z.string().optional().describe('Embedding model for this namespace.'),
                    dimensions: z.number().int().positive().optional(),
                },
                annotations: WRITE_ANNOTATIONS,
            },
            async ({ name, description, embedding_model, dimensions }) =>
                jsonResult(
                    await client.post('/memory/namespaces', {
                        name,
                        description,
                        embeddingModel: embedding_model,
                        dimensions,
                    }),
                ),
        );
    }

    if (caps.destructive) {
        server.registerTool(
            'delete_memory',
            {
                title: 'Delete a memory',
                description: 'Permanently delete a memory by id. This cannot be undone.',
                inputSchema: { memory_id: z.string().min(1).describe('The memory id to delete.') },
                annotations: DESTRUCTIVE_ANNOTATIONS,
            },
            async ({ memory_id }) => jsonResult(await client.del(`/v1/memory/${memory_id}`)),
        );
    }
}
