import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import { jsonResult, READ_ONLY_ANNOTATIONS } from './shared.js';

/**
 * Governance read tools. Phase 3 adds maker/draft write tools (create_policy,
 * install_template). Activation and change-request responses stay MANUAL — see
 * the how_to_* guidance tools.
 */
export function registerGovernanceTools(server: McpServer, client: PlatformClient): void {
    server.registerTool(
        'list_policies',
        {
            title: 'List governance policies',
            description: 'List governance policies for the org, optionally filtered by status.',
            inputSchema: {
                status: z.enum(['draft', 'pending_review', 'active', 'retired']).optional(),
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async ({ status }) => jsonResult(await client.get('/v1/governance/policies', { status })),
    );

    server.registerTool(
        'list_roles',
        {
            title: 'List governance roles',
            description: 'List governance roles defined for the org.',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => jsonResult(await client.get('/v1/governance/roles')),
    );

    server.registerTool(
        'list_change_requests',
        {
            title: 'List governance change requests',
            description: 'List maker-checker change requests for governance policies.',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => jsonResult(await client.get('/v1/governance/change-requests')),
    );

    server.registerTool(
        'get_governance_ledger',
        {
            title: 'Get governance audit ledger',
            description: 'Read the immutable governance audit ledger.',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => jsonResult(await client.get('/v1/governance/ledger')),
    );

    server.registerTool(
        'get_governance_evidence',
        {
            title: 'Get governance evidence',
            description: 'Read governance evidence records (enforcement decisions).',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => jsonResult(await client.get('/v1/governance/evidence')),
    );

    server.registerTool(
        'list_governance_templates',
        {
            title: 'List governance policy templates',
            description: 'List installable governance policy templates.',
            inputSchema: {},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async () => jsonResult(await client.get('/v1/governance/templates')),
    );
}
