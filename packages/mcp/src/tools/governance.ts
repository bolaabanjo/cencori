import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PlatformClient } from '../client.js';
import type { McpCapabilities } from '../config.js';
import { jsonResult, READ_ONLY_ANNOTATIONS, WRITE_ANNOTATIONS } from './shared.js';

/**
 * Governance tools. Reads always register; maker/draft writes (create_policy,
 * install_template) need CENCORI_MCP_WRITE. Activation and change-request
 * responses stay MANUAL — see the how_to_* guidance tools. There is
 * deliberately no destructive governance tool.
 */
export function registerGovernanceTools(server: McpServer, client: PlatformClient, caps: McpCapabilities): void {
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

    if (caps.write) {
        server.registerTool(
            'create_policy',
            {
                title: 'Draft a governance policy',
                description:
                    'Create a governance policy as a DRAFT. It is not enforced until a human activates it (see how_to_activate_policy).',
                inputSchema: {
                    name: z.string().min(1).describe('Policy name (unique per org).'),
                    spec: z
                        .record(z.string(), z.unknown())
                        .describe('Policy spec object: match + rules + defaults + controls.'),
                },
                annotations: WRITE_ANNOTATIONS,
            },
            async ({ name, spec }) => jsonResult(await client.post('/v1/governance/policies', { name, spec })),
        );

        server.registerTool(
            'install_template',
            {
                title: 'Install a governance policy template',
                description:
                    'Install a policy template as a new DRAFT policy. Activation remains a manual human step (see how_to_activate_policy).',
                inputSchema: {
                    template_id: z.string().min(1).describe('The template id to install.'),
                    name: z.string().min(1).describe('Name for the new draft policy.'),
                },
                annotations: WRITE_ANNOTATIONS,
            },
            async ({ template_id, name }) =>
                jsonResult(await client.post(`/v1/governance/templates/${template_id}/install`, { name })),
        );
    }
}
