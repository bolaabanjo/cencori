/**
 * @vitest-environment node
 *
 * Layer 4 decay & strength. A memory system is only as good as its forgetting.
 * Strength must reward use, decay neglect, and NEVER auto-delete.
 */
import { describe, expect, it } from 'vitest';

import {
    memoryStrength,
    classifyStrength,
    suggestForForgetting,
    daysSinceUse,
    lastUsedAt,
    type StrengthInput,
} from '../strength';

const NOW = Date.parse('2026-07-19T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const m = (over: Partial<StrengthInput> = {}): StrengthInput => ({
    importance: 0.5,
    accessCount: 0,
    createdAt: daysAgo(0),
    lastAccessedAt: null,
    ...over,
});

describe('lastUsedAt / daysSinceUse', () => {
    it('prefers last access, falls back to creation', () => {
        expect(lastUsedAt(m({ lastAccessedAt: daysAgo(2), createdAt: daysAgo(100) }))).toBe(daysAgo(2));
        expect(lastUsedAt(m({ lastAccessedAt: null, createdAt: daysAgo(100) }))).toBe(daysAgo(100));
    });
    it('is Infinity when there is no usable timestamp', () => {
        expect(daysSinceUse(m({ lastAccessedAt: null, createdAt: null }), NOW)).toBe(Infinity);
    });
});

describe('memoryStrength', () => {
    it('recent USE keeps an old memory strong (reinforcement slows decay)', () => {
        const oldButUsed = m({ importance: 0.6, createdAt: daysAgo(365), lastAccessedAt: daysAgo(1), accessCount: 8 });
        const oldAndUntouched = m({ importance: 0.6, createdAt: daysAgo(365), lastAccessedAt: null, accessCount: 0 });
        expect(memoryStrength(oldButUsed, { now: NOW })).toBeGreaterThan(memoryStrength(oldAndUntouched, { now: NOW }));
    });

    it('importance still matters when never used', () => {
        const important = m({ importance: 0.95, createdAt: daysAgo(200), lastAccessedAt: null });
        const trivial = m({ importance: 0.1, createdAt: daysAgo(200), lastAccessedAt: null });
        expect(memoryStrength(important, { now: NOW })).toBeGreaterThan(memoryStrength(trivial, { now: NOW }));
    });

    it('stays within [0,1]', () => {
        const maxed = m({ importance: 1, accessCount: 1000, lastAccessedAt: daysAgo(0) });
        const s = memoryStrength(maxed, { now: NOW });
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThanOrEqual(1);
    });
});

describe('classifyStrength', () => {
    it('buckets fresh-important as strong and old-trivial-untouched as stale', () => {
        expect(classifyStrength(m({ importance: 0.9, lastAccessedAt: daysAgo(0), accessCount: 5 }), { now: NOW })).toBe('strong');
        expect(classifyStrength(m({ importance: 0.1, createdAt: daysAgo(300), lastAccessedAt: null }), { now: NOW })).toBe('stale');
    });
});

describe('suggestForForgetting', () => {
    it('returns only stale, low-strength, long-idle memories — weakest first', () => {
        const memories = [
            m({ importance: 0.9, lastAccessedAt: daysAgo(1), accessCount: 10 }),        // strong, keep
            m({ importance: 0.1, createdAt: daysAgo(300), lastAccessedAt: null }),      // stale + idle → suggest
            m({ importance: 0.2, createdAt: daysAgo(400), lastAccessedAt: null }),      // stale + idle → suggest (weaker)
            m({ importance: 0.1, createdAt: daysAgo(3), lastAccessedAt: daysAgo(3) }),  // weak but recent → keep
        ];
        const sugg = suggestForForgetting(memories, { now: NOW, minIdleDays: 60 });
        // Two candidates, weakest (400d) first.
        expect(sugg).toHaveLength(2);
        expect(sugg[0].strength).toBeLessThanOrEqual(sugg[1].strength);
        expect(sugg[0].idleDays).toBeGreaterThanOrEqual(60);
    });

    it('respects the limit and never returns strong/recent memories', () => {
        const memories = Array.from({ length: 5 }, (_, i) =>
            m({ importance: 0.1, createdAt: daysAgo(100 + i * 10), lastAccessedAt: null })
        );
        const sugg = suggestForForgetting(memories, { now: NOW, minIdleDays: 60, limit: 2 });
        expect(sugg).toHaveLength(2);
    });

    it('returns nothing when everything is fresh or important (does not force forgetting)', () => {
        const memories = [
            m({ importance: 0.9, lastAccessedAt: daysAgo(0) }),
            m({ importance: 0.8, lastAccessedAt: daysAgo(2) }),
        ];
        expect(suggestForForgetting(memories, { now: NOW })).toEqual([]);
    });
});
