import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocsClient } from '../docs/client.js';
import { jsonResult, READ_ONLY_ANNOTATIONS } from './shared.js';

export function registerDocsTools(server: McpServer, docs: DocsClient, docsBaseUrl: string): void {
    server.registerTool(
        'search_docs',
        {
            title: 'Search Cencori docs',
            description:
                'Search Cencori documentation by keyword. Returns matching pages with title, section, URL, and snippet.',
            inputSchema: {
                query: z
                    .string()
                    .min(2)
                    .describe('Search query (minimum 2 characters). Example: "rate limiting", "api keys", "failover".'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ query }) => {
            const { results } = await docs.search(query);
            return jsonResult({ query, count: results.length, results });
        },
    );

    server.registerTool(
        'get_doc',
        {
            title: 'Get Cencori doc page',
            description:
                'Fetch the raw markdown content of a Cencori documentation page by slug. Example slugs: "quick-start", "ai/sdk", "api/chat".',
            inputSchema: {
                slug: z
                    .string()
                    .min(1)
                    .describe('Doc slug without /docs/ prefix. Example: "ai/gateway" or "security/scan".'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ slug }) => {
            const doc = await docs.getDoc(slug);
            const normalizedSlug = slug.replace(/^\/docs\//, '').replace(/^\//, '');

            if (doc.error) {
                return jsonResult({ slug: normalizedSlug, error: doc.error });
            }

            return jsonResult({
                slug: normalizedSlug,
                url: `${docsBaseUrl}/docs/${normalizedSlug}`,
                content: doc.content,
            });
        },
    );

    server.registerTool(
        'list_docs',
        {
            title: 'List Cencori docs',
            description:
                'List the Cencori documentation table of contents grouped by section (Getting Started, Platform, AI, API Reference, etc.).',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => {
            const navigation = await docs.listNavigation();
            return jsonResult(navigation);
        },
    );

    server.registerTool(
        'get_integration_guide',
        {
            title: 'Get the Cencori integration guide (llm.txt)',
            description:
                'Fetch the full Cencori "Integration Contract for Code Agents" (llm.txt) — the authoritative, always-current guide for setting up Cencori in a codebase: package names, import paths, env vars, base URLs, SDK usage, request/response shapes, and step-by-step setup. Call this FIRST when asked to add, integrate, or set up Cencori in a project.',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => {
            const guide = await docs.getIntegrationGuide();
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Source: ${docsBaseUrl}/llm.txt\n\n${guide}`,
                    },
                ],
            };
        },
    );
}
