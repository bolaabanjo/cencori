import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient, MetricsPeriod } from '../client.js';
import { jsonResult, READ_ONLY_ANNOTATIONS } from './shared.js';

export function registerGatewayTools(server: McpServer, client: PlatformClient): void {
    server.registerTool(
        'list_models',
        {
            title: 'List Cencori gateway models',
            description: 'List models available through the Cencori gateway for the authenticated project.',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => {
            const models = await client.listModels();
            return jsonResult(models);
        },
    );

    server.registerTool(
        'get_metrics',
        {
            title: 'Get Cencori gateway metrics',
            description:
                'Get gateway usage metrics for the authenticated project, including requests, cost, tokens, latency, and model/provider breakdowns.',
            inputSchema: {
                period: z
                    .enum(['1h', '24h', '7d', '30d', 'mtd'])
                    .optional()
                    .describe('Metrics time window. Allowed values: 1h, 24h, 7d, 30d, mtd.'),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ period }) => {
            const metrics = await client.getMetrics(period as MetricsPeriod | undefined);
            return jsonResult(metrics);
        },
    );
}
