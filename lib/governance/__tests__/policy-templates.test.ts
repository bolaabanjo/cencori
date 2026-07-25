import { describe, it, expect, vi } from 'vitest';
import {
    POLICY_TEMPLATES,
    listPolicyTemplates,
    getPolicyTemplate,
    installPolicyTemplate,
} from '../policy-templates';
import { evaluatePolicies } from '../policy-engine';
import type { Policy } from '../policy-types';

const VALID_ACTIONS = new Set(['allow', 'block', 'redact', 'tokenize', 'route', 'require_approval', 'rate_limit']);

const asPolicy = (id: string): Policy => {
    const t = getPolicyTemplate(id)!;
    return { name: t.id, version: 1, status: 'active', ...t.spec };
};

describe('template catalogue integrity', () => {
    it('every template is well-formed and evaluatable', () => {
        for (const t of POLICY_TEMPLATES) {
            expect(t.spec.rules.length).toBeGreaterThan(0);
            expect(t.frameworks.length).toBeGreaterThan(0);
            for (const rule of t.spec.rules) {
                expect(VALID_ACTIONS.has(rule.action)).toBe(true);
                // redact/tokenize rules MUST carry a pattern or they can't redact anything.
                if (rule.action === 'redact' || rule.action === 'tokenize') {
                    expect(typeof rule.params?.pattern).toBe('string');
                }
                // every rule must have at least one predicate.
                const preds = [...(rule.when.all ?? []), ...(rule.when.any ?? [])];
                expect(preds.length).toBeGreaterThan(0);
            }
        }
    });

    it('listPolicyTemplates omits the spec; getPolicyTemplate returns it', () => {
        const list = listPolicyTemplates();
        expect(list.length).toBe(POLICY_TEMPLATES.length);
        expect((list[0] as { spec?: unknown }).spec).toBeUndefined();
        expect(getPolicyTemplate('cbn-aml')?.spec).toBeDefined();
        expect(getPolicyTemplate('nope')).toBeUndefined();
    });
});

describe('templates actually enforce', () => {
    it('ndpr-pii-redaction tokenizes a Nigerian account number', () => {
        const res = evaluatePolicies([asPolicy('ndpr-pii-redaction')], { direction: 'input', content: 'send to account 0123456789 today' });
        expect(res.decision).toBe('tokenize');
        expect(res.firedRules.some(f => f.rule === 'tokenize-account')).toBe(true);
    });

    it('cbn-aml requires approval for a high-value transfer', () => {
        const res = evaluatePolicies([asPolicy('cbn-aml')], { direction: 'input', content: 'please wire the money', amount: 9_000_000 });
        expect(res.decision).toBe('require_approval');
    });

    it('cbn-aml blocks a high jailbreak score', () => {
        const res = evaluatePolicies([asPolicy('cbn-aml')], { direction: 'input', signals: { jailbreak_score: 0.9 } });
        expect(res.decision).toBe('block');
    });

    it('prompt-injection-defense blocks a detected injection', () => {
        const res = evaluatePolicies([asPolicy('prompt-injection-defense')], { direction: 'input', signals: { prompt_injection: true } });
        expect(res.decision).toBe('block');
    });

    it('pci-dss redacts a card number on input', () => {
        const res = evaluatePolicies([asPolicy('pci-dss')], { direction: 'input', content: 'card 4111 1111 1111 1111' });
        expect(res.decision).toBe('redact');
    });
});

describe('installPolicyTemplate', () => {
    it('creates a draft from a known template', async () => {
        const rpc = vi.fn((fn: string) => {
            if (fn === 'create_governance_policy_draft') return Promise.resolve({ data: [{ id: 'pol-x', version: 1 }], error: null });
            return Promise.resolve({ data: [{ id: 'e', seq: 1, entry_hash: 'h', prev_hash: 'p' }], error: null });
        });
        const res = await installPolicyTemplate({ rpc } as never, { orgId: 'o1', templateId: 'cbn-aml', createdBy: 'u1' });
        expect(res).toEqual({ id: 'pol-x', name: 'cbn-aml', version: 1 });
    });

    it('returns an error for an unknown template', async () => {
        const res = await installPolicyTemplate({ rpc: vi.fn() } as never, { orgId: 'o1', templateId: 'nope', createdBy: 'u1' });
        expect(res).toEqual({ error: 'Template not found' });
    });
});
