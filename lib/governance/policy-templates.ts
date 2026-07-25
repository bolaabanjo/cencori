/**
 * Starter policy templates (PRD M1). Pre-built, framework-mapped governance
 * policies so a customer switches on compliance in one call instead of authoring
 * from a blank file. Installing a template creates a DRAFT (it still goes through
 * maker-checker before it's active). Tuned for the Nigerian FI market (CBN-AML,
 * NDPR) plus the global frameworks (PCI-DSS, ISO-42001/NIST, SR-11-7).
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { PolicySpec } from '@/lib/governance/policy-store';
import { createPolicyDraft } from '@/lib/governance/policy-store';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export interface PolicyTemplate {
    id: string;
    title: string;
    description: string;
    frameworks: string[];
    spec: PolicySpec;
}

// ── Reusable detection patterns ──────────────────────────────────────────────
const P_EMAIL = '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}';
const P_NUBAN = '\\b\\d{10}\\b';                    // Nigerian bank account number
const P_BVN = '\\b\\d{11}\\b';                      // Bank Verification Number
const P_NG_PHONE = '\\b(?:\\+234|0)[789]\\d{9}\\b';
const P_CARD = '\\b(?:\\d[ -]*?){13,16}\\b';

export const POLICY_TEMPLATES: PolicyTemplate[] = [
    {
        id: 'cbn-aml',
        title: 'CBN Anti-Money-Laundering',
        description: 'Human approval for high-value / transfer instructions; blocks jailbreaks and data-exfiltration attempts. Aligns with the CBN automated-AML mandate.',
        frameworks: ['CBN-AML', 'SR-11-7'],
        spec: {
            controls: ['CBN-AML', 'SR-11-7:model-monitoring'],
            rules: [
                {
                    name: 'hitl-high-value-transfer',
                    direction: 'input',
                    when: { any: [{ field: 'content', matches: 'transfer|wire|disburse|remit|payout' }, { field: 'amount', gt: 5_000_000 }] },
                    action: 'require_approval',
                    severity: 'high',
                },
                { name: 'block-jailbreak', when: { all: [{ field: 'signals.jailbreak_score', gte: 0.8 }] }, action: 'block', severity: 'critical' },
                { name: 'block-exfiltration', when: { all: [{ field: 'signals.exfiltration', equals: true }] }, action: 'block', severity: 'high' },
            ],
            defaults: { onNoMatch: 'allow' },
        },
    },
    {
        id: 'ndpr-pii-redaction',
        title: 'NDPR PII Redaction',
        description: 'Tokenizes Nigerian customer PII (account number, BVN, email, phone) out of prompts before they reach the model. Nothing sensitive leaves the boundary.',
        frameworks: ['NDPR', 'NDPA-2023', 'ISO-42001'],
        spec: {
            controls: ['NDPR', 'ISO-42001:A.8.3'],
            rules: [
                { name: 'tokenize-account', direction: 'input', when: { all: [{ field: 'content', matches: P_NUBAN }] }, action: 'tokenize', params: { pattern: P_NUBAN }, severity: 'high' },
                { name: 'tokenize-bvn', direction: 'input', when: { all: [{ field: 'content', matches: P_BVN }] }, action: 'tokenize', params: { pattern: P_BVN }, severity: 'high' },
                { name: 'mask-email', direction: 'input', when: { all: [{ field: 'content', matches: P_EMAIL }] }, action: 'redact', params: { pattern: P_EMAIL } },
                { name: 'mask-phone', direction: 'input', when: { all: [{ field: 'content', matches: P_NG_PHONE }] }, action: 'redact', params: { pattern: P_NG_PHONE } },
            ],
            defaults: { onNoMatch: 'allow' },
        },
    },
    {
        id: 'pci-dss',
        title: 'PCI-DSS Card-Data Protection',
        description: 'Redacts payment-card numbers from prompts and blocks responses flagged as containing card data.',
        frameworks: ['PCI-DSS'],
        spec: {
            controls: ['PCI-DSS:3.4'],
            rules: [
                { name: 'mask-card-input', direction: 'input', when: { all: [{ field: 'content', matches: P_CARD }] }, action: 'redact', params: { pattern: P_CARD }, severity: 'high' },
                { name: 'block-card-output', direction: 'output', when: { all: [{ field: 'signals.pci', equals: true }] }, action: 'redact', params: { pattern: P_CARD }, severity: 'high' },
            ],
            defaults: { onNoMatch: 'allow' },
        },
    },
    {
        id: 'prompt-injection-defense',
        title: 'Prompt-Injection & Jailbreak Defense',
        description: 'Uses the model-based classifier to block prompt-injection, jailbreaks, and system-prompt-extraction attempts inline.',
        frameworks: ['ISO-42001', 'NIST-AI-RMF'],
        spec: {
            controls: ['ISO-42001:A.6.2', 'NIST-AI-RMF:MEASURE'],
            rules: [
                { name: 'block-jailbreak', when: { all: [{ field: 'signals.jailbreak_score', gte: 0.75 }] }, action: 'block', severity: 'critical' },
                { name: 'block-injection', when: { all: [{ field: 'signals.prompt_injection', equals: true }] }, action: 'block', severity: 'high' },
                { name: 'block-exfiltration', when: { all: [{ field: 'signals.exfiltration', equals: true }] }, action: 'block', severity: 'high' },
            ],
            defaults: { onNoMatch: 'allow' },
        },
    },
    {
        id: 'sr-11-7-model-risk',
        title: 'SR 11-7 Automated-Decision Oversight',
        description: 'Requires human approval when the model is used for automated credit / lending / adverse-action decisions, and logs every one.',
        frameworks: ['SR-11-7', 'OCC-2011-12'],
        spec: {
            controls: ['SR-11-7:effective-challenge'],
            rules: [
                {
                    name: 'hitl-automated-credit-decision',
                    direction: 'output',
                    when: { any: [{ field: 'content', matches: 'approv(e|ed|al)|declin(e|ed)|reject(ed)?|adverse action|credit (limit|decision)|loan (approv|denial)' }] },
                    action: 'require_approval',
                    severity: 'high',
                },
            ],
            defaults: { onNoMatch: 'allow' },
        },
    },
];

export function listPolicyTemplates(): Array<Omit<PolicyTemplate, 'spec'>> {
    return POLICY_TEMPLATES.map(({ id, title, description, frameworks }) => ({ id, title, description, frameworks }));
}

export function getPolicyTemplate(id: string): PolicyTemplate | undefined {
    return POLICY_TEMPLATES.find(t => t.id === id);
}

/** Install a template as a DRAFT policy for the org (still needs maker-checker to activate). */
export async function installPolicyTemplate(
    supabase: SupabaseAdmin,
    p: { orgId: string; templateId: string; name?: string; createdBy: string; actorIp?: string | null },
): Promise<{ id: string; name: string; version: number } | { error: string }> {
    const template = getPolicyTemplate(p.templateId);
    if (!template) return { error: 'Template not found' };

    const name = p.name?.trim() || template.id;
    const result = await createPolicyDraft(supabase, {
        orgId: p.orgId, name, spec: template.spec, createdBy: p.createdBy, actorIp: p.actorIp,
    });
    return { id: result.id, name, version: result.version };
}
