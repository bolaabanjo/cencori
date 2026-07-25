import { describe, it, expect } from 'vitest';
import { evaluatePolicies, evaluatePredicate } from '../policy-engine';
import type { Policy, EvalContext } from '../policy-types';

const active = (p: Partial<Policy> & { name: string; rules: Policy['rules'] }): Policy => ({
    version: 1, status: 'active', ...p,
});

describe('evaluatePredicate', () => {
    const ctx: EvalContext = {
        direction: 'input', model: 'gpt', region: 'EU', amount: 6_000_000, content: 'please wire the funds',
        signals: { jailbreak_score: 0.91, 'pii.account_number': true },
    };
    it('numeric comparators', () => {
        expect(evaluatePredicate(ctx, { field: 'signals.jailbreak_score', gte: 0.8 })).toBe(true);
        expect(evaluatePredicate(ctx, { field: 'signals.jailbreak_score', lt: 0.8 })).toBe(false);
        expect(evaluatePredicate(ctx, { field: 'amount', gt: 5_000_000 })).toBe(true);
    });
    it('present / equals / in / matches', () => {
        expect(evaluatePredicate(ctx, { field: 'signals.pii.account_number', present: true })).toBe(true);
        expect(evaluatePredicate(ctx, { field: 'signals.pii.ssn', present: false })).toBe(true);
        expect(evaluatePredicate(ctx, { field: 'region', equals: 'EU' })).toBe(true);
        expect(evaluatePredicate(ctx, { field: 'region', in: ['US', 'EU'] })).toBe(true);
        expect(evaluatePredicate(ctx, { field: 'content', matches: 'wire|transfer' })).toBe(true);
        expect(evaluatePredicate(ctx, { field: 'content', matches: 'refund' })).toBe(false);
    });
    it('a bad regex fails closed (no match, no throw)', () => {
        expect(evaluatePredicate(ctx, { field: 'content', matches: '(' })).toBe(false);
    });
});

describe('evaluatePolicies — decisions', () => {
    it('allows when nothing matches', () => {
        const res = evaluatePolicies([active({ name: 'p', rules: [
            { name: 'r', direction: 'input', when: { all: [{ field: 'signals.jailbreak_score', gte: 0.8 }] }, action: 'block' },
        ] })], { direction: 'input', signals: { jailbreak_score: 0.1 } });
        expect(res.decision).toBe('allow');
        expect(res.firedRules).toHaveLength(0);
        expect(res.matchedPolicies).toBe(true);
    });

    it('blocks a jailbreak on input', () => {
        const res = evaluatePolicies([active({ name: 'jb', controls: ['ISO-42001:A.8'], rules: [
            { name: 'block-jailbreak', when: { all: [{ field: 'signals.jailbreak_score', gte: 0.8 }] }, action: 'block', severity: 'high' },
        ] })], { direction: 'input', signals: { jailbreak_score: 0.9 } });
        expect(res.decision).toBe('block');
        expect(res.firedRules[0]).toMatchObject({ rule: 'block-jailbreak', controls: ['ISO-42001:A.8'] });
        expect(res.rationale).toMatch(/block by policy "jb"/);
    });

    it('most-restrictive-wins: block overrides a redact', () => {
        const res = evaluatePolicies([active({ name: 'p', rules: [
            { name: 'redact-acct', direction: 'output', when: { all: [{ field: 'signals.pii.account_number', present: true }] }, action: 'redact' },
            { name: 'block-leak', direction: 'output', when: { all: [{ field: 'signals.exfiltration', present: true }] }, action: 'block' },
        ] })], { direction: 'output', signals: { 'pii.account_number': true, exfiltration: true } });
        expect(res.decision).toBe('block');
        expect(res.firedRules).toHaveLength(2);
    });

    it('require_approval for a high-value instruction', () => {
        const res = evaluatePolicies([active({ name: 'aml', rules: [
            { name: 'hitl-high-value', direction: 'input', when: { any: [{ field: 'content', matches: 'transfer|wire' }, { field: 'amount', gt: 5_000_000 }] }, action: 'require_approval' },
        ] })], { direction: 'input', amount: 9_000_000, content: 'schedule a payment' });
        expect(res.decision).toBe('require_approval');
    });

    it('routes EU data to the EU region', () => {
        const res = evaluatePolicies([active({ name: 'res', rules: [
            { name: 'eu-residency', when: { all: [{ field: 'user.region', equals: 'EU' }] }, action: 'route', params: { region: 'eu-west' } },
        ] })], { direction: 'input', region: 'EU' });
        expect(res.decision).toBe('route');
        expect(res.firedRules[0].params).toEqual({ region: 'eu-west' });
    });

    it('direction gates rules (an output rule does not fire on input)', () => {
        const res = evaluatePolicies([active({ name: 'p', rules: [
            { name: 'out-only', direction: 'output', when: { all: [{ field: 'signals.pii.account_number', present: true }] }, action: 'redact' },
        ] })], { direction: 'input', signals: { 'pii.account_number': true } });
        expect(res.decision).toBe('allow');
    });

    it('deny-by-default blocks when no rule matches', () => {
        const res = evaluatePolicies([active({ name: 'strict', defaults: { onNoMatch: 'block' }, rules: [
            { name: 'r', when: { all: [{ field: 'signals.jailbreak_score', gte: 0.9 }] }, action: 'block' },
        ] })], { direction: 'input', signals: { jailbreak_score: 0.1 } });
        expect(res.decision).toBe('block');
        expect(res.rationale).toMatch(/deny-by-default/);
    });

    it('ignores non-active policies', () => {
        const res = evaluatePolicies([
            { name: 'draft', version: 2, status: 'draft', rules: [{ name: 'r', when: { all: [{ field: 'amount', gt: 0 }] }, action: 'block' }] },
        ], { direction: 'input', amount: 100 });
        expect(res.decision).toBe('allow');
        expect(res.matchedPolicies).toBe(false);
    });

    it('respects match scoping (model / environment)', () => {
        const policy = active({ name: 'p', match: { models: ['gpt-5'], environments: ['production'] }, rules: [
            { name: 'r', when: { all: [{ field: 'amount', gt: 0 }] }, action: 'block' },
        ] });
        // wrong model → does not apply
        expect(evaluatePolicies([policy], { direction: 'input', model: 'gemini', environment: 'production', amount: 1 }).decision).toBe('allow');
        // right model + env → applies
        expect(evaluatePolicies([policy], { direction: 'input', model: 'gpt-5', environment: 'production', amount: 1 }).decision).toBe('block');
    });
});
