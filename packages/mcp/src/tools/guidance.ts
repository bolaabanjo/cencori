import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { jsonResult, READ_ONLY_ANNOTATIONS } from './shared.js';

/**
 * Guidance ("how_to_*") tools for MANUAL-ONLY actions.
 *
 * These are security- or account-sensitive actions the MCP must NEVER perform
 * on the user's behalf — API keys, governance activation, billing, and access
 * changes. Instead each tool returns human steps + the exact dashboard URL so
 * the agent can tell the user to do it themselves. All read-only, always
 * available (no API key or capability flag required).
 */

const orgProjectShape = {
    org_slug: z.string().min(1).optional().describe('Your organization slug, to build an exact dashboard link.'),
    project_slug: z.string().min(1).optional().describe('Your project slug, to build an exact dashboard link.'),
};

type SlugArgs = { org_slug?: string; project_slug?: string };

function registerGuide(
    server: McpServer,
    name: string,
    title: string,
    description: string,
    buildPath: (args: SlugArgs) => string,
    steps: string[],
    baseUrl: string,
): void {
    server.registerTool(
        name,
        {
            title,
            description,
            inputSchema: orgProjectShape,
            annotations: READ_ONLY_ANNOTATIONS,
        },
        async (args: SlugArgs) => {
            return jsonResult({
                manual_action: true,
                note: 'This action is intentionally not automated. Tell the user to complete it themselves in the Cencori dashboard.',
                steps,
                dashboard_url: `${baseUrl}${buildPath(args)}`,
            });
        },
    );
}

const ORG = (s: SlugArgs) => s.org_slug ?? '<your-org>';
const PROJ = (s: SlugArgs) => s.project_slug ?? '<your-project>';

export function registerGuidanceTools(server: McpServer, baseUrl: string): void {
    // ── API keys ──────────────────────────────────────────────────────────
    registerGuide(
        server,
        'how_to_create_api_key',
        'How to create a Cencori API key',
        'Steps for the USER to create a Cencori project API key. The MCP never creates keys.',
        (s) => `/${ORG(s)}/${PROJ(s)}/api-keys`,
        [
            'Open the Cencori dashboard and select your organization, then your project.',
            'Go to the project’s API Keys page.',
            'Click “Create key”, name it, choose the environment, and copy the `csk_...` secret.',
            'Store it server-side as CENCORI_API_KEY — it is shown only once.',
        ],
        baseUrl,
    );
    registerGuide(
        server,
        'how_to_edit_api_key',
        'How to edit a Cencori API key',
        'Steps for the USER to rename or change scopes/limits on an API key. The MCP never edits keys.',
        (s) => `/${ORG(s)}/${PROJ(s)}/api-keys`,
        [
            'Open the project’s API Keys page in the dashboard.',
            'Find the key and open its actions menu.',
            'Update its name, environment, or limits and save.',
        ],
        baseUrl,
    );
    registerGuide(
        server,
        'how_to_revoke_api_key',
        'How to revoke a Cencori API key',
        'Steps for the USER to revoke/rotate an API key. The MCP never revokes keys.',
        (s) => `/${ORG(s)}/${PROJ(s)}/api-keys`,
        [
            'Open the project’s API Keys page in the dashboard.',
            'Find the key to revoke and choose “Revoke”. This immediately invalidates it.',
            'If rotating, create a new key first and update CENCORI_API_KEY before revoking the old one.',
        ],
        baseUrl,
    );

    // ── Governance (human/checker steps) ──────────────────────────────────
    registerGuide(
        server,
        'how_to_activate_policy',
        'How to activate a governance policy',
        'Steps for the USER to activate/retire a governance policy. Activation is a maker-checker human step — the MCP can draft a policy but never activates one.',
        (s) => `/${ORG(s)}/~/governance`,
        [
            'Open the Governance page for your organization in the dashboard.',
            'Find the draft (or pending-review) policy version.',
            'Review it and, as an authorized checker, activate it. Exactly one version per policy can be active.',
        ],
        baseUrl,
    );
    registerGuide(
        server,
        'how_to_respond_to_change_request',
        'How to respond to a governance change request',
        'Steps for the USER (as checker) to approve or reject a governance change request. The MCP never approves/rejects on the user’s behalf.',
        (s) => `/${ORG(s)}/~/governance`,
        [
            'Open the Governance page and go to Change Requests.',
            'Open the pending request and review the proposed change.',
            'As an authorized checker, approve or reject it.',
        ],
        baseUrl,
    );

    // ── Billing ───────────────────────────────────────────────────────────
    registerGuide(
        server,
        'how_to_change_plan',
        'How to change your Cencori plan',
        'Steps for the USER to change plan/tier. The MCP never changes plans or charges.',
        (s) => `/${ORG(s)}/~/billing`,
        [
            'Open the Billing page for your organization in the dashboard.',
            'Choose the plan you want and confirm the change.',
        ],
        baseUrl,
    );
    registerGuide(
        server,
        'how_to_manage_billing',
        'How to manage billing, payment methods, and credits',
        'Steps for the USER to update payment methods or buy credits. The MCP never manages payment or credits.',
        (s) => `/${ORG(s)}/~/billing`,
        [
            'Open the Billing page for your organization in the dashboard.',
            'Update a payment method, or purchase credits, from the billing controls.',
        ],
        baseUrl,
    );

    // ── Access / members ──────────────────────────────────────────────────
    registerGuide(
        server,
        'how_to_manage_members',
        'How to manage members, roles, and SSO',
        'Steps for the USER to invite/remove members, change roles, or configure SSO. The MCP never alters access.',
        (s) => `/${ORG(s)}/~/teams`,
        [
            'Open the Teams page for your organization in the dashboard.',
            'Invite or remove members, or change a member’s role.',
            'Configure SSO from the organization settings if applicable.',
        ],
        baseUrl,
    );
}
