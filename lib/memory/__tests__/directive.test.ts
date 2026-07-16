import { describe, expect, it } from 'vitest';
import { fromMemoryId, parseMemoryDirective, toMemoryId } from '../types';

describe('parseMemoryDirective', () => {
    it('applies defaults for a minimal user-scope directive', () => {
        const result = parseMemoryDirective({ userId: 'user_123' });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.directive).toMatchObject({
            scope: 'user',
            scopeKey: 'user_123',
            retrieve: true,
            write: true,
            topK: 5,
            threshold: 0.7,
            namespace: null,
            extract: null,
        });
    });

    it('rejects non-objects', () => {
        expect(parseMemoryDirective(null).ok).toBe(false);
        expect(parseMemoryDirective('memory').ok).toBe(false);
        expect(parseMemoryDirective([1]).ok).toBe(false);
        expect(parseMemoryDirective(42).ok).toBe(false);
    });

    it('requires userId for user scope', () => {
        expect(parseMemoryDirective({}).ok).toBe(false);
        expect(parseMemoryDirective({ userId: '   ' }).ok).toBe(false);
        expect(parseMemoryDirective({ scope: 'user', sessionId: 'sess_1' }).ok).toBe(false);
    });

    it('accepts sessionId (with userId fallback) for session scope', () => {
        const withSession = parseMemoryDirective({ scope: 'session', sessionId: 'sess_1' });
        expect(withSession.ok).toBe(true);
        if (withSession.ok) expect(withSession.directive.scopeKey).toBe('sess_1');

        const fallback = parseMemoryDirective({ scope: 'session', userId: 'user_9' });
        expect(fallback.ok).toBe(true);
        if (fallback.ok) expect(fallback.directive.scopeKey).toBe('user_9');

        expect(parseMemoryDirective({ scope: 'session' }).ok).toBe(false);
    });

    it('rejects non-Phase-1 scopes', () => {
        expect(parseMemoryDirective({ userId: 'u', scope: 'workspace' }).ok).toBe(false);
        expect(parseMemoryDirective({ userId: 'u', scope: 'org' }).ok).toBe(false);
        expect(parseMemoryDirective({ userId: 'u', scope: 'global' }).ok).toBe(false);
    });

    it('clamps topK to 1..20 and rounds', () => {
        const zero = parseMemoryDirective({ userId: 'u', topK: 0 });
        const fifty = parseMemoryDirective({ userId: 'u', topK: 50 });
        const frac = parseMemoryDirective({ userId: 'u', topK: 3.6 });
        expect(zero.ok && zero.directive.topK).toBe(1);
        expect(fifty.ok && fifty.directive.topK).toBe(20);
        expect(frac.ok && frac.directive.topK).toBe(4);
    });

    it('clamps threshold to 0..1', () => {
        const high = parseMemoryDirective({ userId: 'u', threshold: 1.5 });
        const low = parseMemoryDirective({ userId: 'u', threshold: -0.2 });
        expect(high.ok && high.directive.threshold).toBe(1);
        expect(low.ok && low.directive.threshold).toBe(0);
    });

    it('flags whether the threshold was explicitly supplied', () => {
        const implicit = parseMemoryDirective({ userId: 'u' });
        const explicit = parseMemoryDirective({ userId: 'u', threshold: 0.42 });
        expect(implicit.ok && implicit.directive.thresholdExplicit).toBe(false);
        expect(explicit.ok && explicit.directive.thresholdExplicit).toBe(true);
        // An explicit 0 must still count as explicit (retrieval must not override it).
        const zero = parseMemoryDirective({ userId: 'u', threshold: 0 });
        expect(zero.ok && zero.directive.thresholdExplicit).toBe(true);
    });

    it('respects explicit retrieve/write false', () => {
        const result = parseMemoryDirective({ userId: 'u', retrieve: false, write: false });
        expect(result.ok && result.directive.retrieve).toBe(false);
        expect(result.ok && result.directive.write).toBe(false);
    });

    it('clamps extract.minImportance and passes model/prompt through', () => {
        const result = parseMemoryDirective({
            userId: 'u',
            extract: { model: 'claude-haiku-4-5', prompt: 'only code facts', minImportance: 2 },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.directive.extract).toEqual({
            model: 'claude-haiku-4-5',
            prompt: 'only code facts',
            minImportance: 1,
        });
    });

    it('rejects oversized scope keys', () => {
        expect(parseMemoryDirective({ userId: 'x'.repeat(257) }).ok).toBe(false);
    });

    it('trims namespace and empty namespace becomes null', () => {
        const named = parseMemoryDirective({ userId: 'u', namespace: '  prefs  ' });
        const empty = parseMemoryDirective({ userId: 'u', namespace: '   ' });
        expect(named.ok && named.directive.namespace).toBe('prefs');
        expect(empty.ok && empty.directive.namespace).toBe(null);
    });
});

describe('memory id helpers', () => {
    it('round-trips ids', () => {
        expect(toMemoryId('abc-123')).toBe('mem_abc-123');
        expect(fromMemoryId('mem_abc-123')).toBe('abc-123');
        expect(fromMemoryId('abc-123')).toBe('abc-123');
    });
});
