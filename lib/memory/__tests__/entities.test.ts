/**
 * @vitest-environment node
 *
 * Layer 5 entity resolution — the make-or-break of a graph. Must merge the same
 * entity under different surface forms without collapsing distinct ones.
 */
import { describe, expect, it } from 'vitest';

import {
    normalizeName,
    normalizeEntityKey,
    resolveEntity,
    parseEntityExtraction,
    type ExistingEntity,
} from '../entities';

const existing = (over: Partial<ExistingEntity> & { id: string; name: string }): ExistingEntity => ({
    entityType: 'person',
    canonicalKey: normalizeEntityKey(over.name, over.entityType ?? 'person'),
    aliases: [],
    ...over,
});

describe('normalize', () => {
    it('lowercases, strips punctuation, collapses whitespace', () => {
        expect(normalizeName('John  Smith @ Zap Corp!')).toBe('john smith zap corp');
        expect(normalizeEntityKey('Zap Corp', 'Org')).toBe('zap corp|org');
    });
});

describe('resolveEntity', () => {
    it('merges on exact canonical identity', () => {
        const e = [existing({ id: 'e1', name: 'Zap Corp', entityType: 'org' })];
        const r = resolveEntity({ name: 'zap corp', type: 'org' }, e);
        expect(r).toMatchObject({ action: 'merge', entityId: 'e1', reason: 'exact' });
    });

    it('merges on a known alias and does not re-add it', () => {
        const e = [existing({ id: 'e1', name: 'Jonathan Smith', aliases: ['J. Smith'] })];
        const r = resolveEntity({ name: 'J. Smith', type: 'person' }, e);
        expect(r).toMatchObject({ action: 'merge', entityId: 'e1', reason: 'alias', addAlias: null });
    });

    it('merges "John" into "John Smith" (fuzzy, same type) and records the alias', () => {
        const e = [existing({ id: 'e1', name: 'John Smith' })];
        const r = resolveEntity({ name: 'John', type: 'person' }, e);
        expect(r).toMatchObject({ action: 'merge', entityId: 'e1', reason: 'fuzzy', addAlias: 'John' });
    });

    it('prefers the most specific existing entity when several contain the tokens', () => {
        const e = [
            existing({ id: 'short', name: 'John' }),
            existing({ id: 'long', name: 'John Smith Junior' }),
        ];
        const r = resolveEntity({ name: 'John Smith', type: 'person' }, e);
        expect(r).toMatchObject({ action: 'merge', entityId: 'long' });
    });

    it('does NOT merge across types (a person named Zap ≠ the org Zap)', () => {
        const e = [existing({ id: 'org1', name: 'Zap', entityType: 'org' })];
        const r = resolveEntity({ name: 'Zap', type: 'person' }, e);
        expect(r.action).toBe('create');
    });

    it('creates a new entity when nothing matches', () => {
        const e = [existing({ id: 'e1', name: 'Sarah Lee' })];
        const r = resolveEntity({ name: 'Marcus Bell', type: 'person' }, e);
        expect(r).toEqual({ action: 'create', canonicalKey: 'marcus bell|person' });
    });
});

describe('parseEntityExtraction', () => {
    it('parses entities and relations, defaulting missing type', () => {
        const raw = JSON.stringify({
            entities: [{ name: 'Sarah', type: 'person' }, { name: 'Ledgerkit' }],
            relations: [{ source: 'Sarah', relation: 'building', target: 'Ledgerkit' }],
        });
        const out = parseEntityExtraction(raw);
        expect(out.entities).toEqual([{ name: 'Sarah', type: 'person' }, { name: 'Ledgerkit', type: 'entity' }]);
        expect(out.relations).toEqual([{ source: 'Sarah', relation: 'building', target: 'Ledgerkit' }]);
    });

    it('strips code fences', () => {
        const out = parseEntityExtraction('```json\n{"entities":[{"name":"X","type":"org"}],"relations":[]}\n```');
        expect(out.entities).toEqual([{ name: 'X', type: 'org' }]);
    });

    it('drops malformed entities/relations and self-relations, never throws', () => {
        const raw = JSON.stringify({
            entities: [{ name: '' }, { type: 'person' }, { name: 'OK', type: 'person' }, 42],
            relations: [
                { source: 'A', relation: 'x', target: 'A' }, // self → dropped
                { source: 'A', relation: '', target: 'B' },   // missing relation → dropped
                { source: 'A', relation: 'knows', target: 'B' },
            ],
        });
        const out = parseEntityExtraction(raw);
        expect(out.entities).toEqual([{ name: 'OK', type: 'person' }]);
        expect(out.relations).toEqual([{ source: 'A', relation: 'knows', target: 'B' }]);
    });

    it('returns empty on non-JSON', () => {
        expect(parseEntityExtraction('sorry, no entities here')).toEqual({ entities: [], relations: [] });
        expect(parseEntityExtraction('')).toEqual({ entities: [], relations: [] });
    });
});
