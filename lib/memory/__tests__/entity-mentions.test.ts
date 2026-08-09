/**
 * @vitest-environment node
 *
 * The pure join between facts and the entity graph: which memories mention
 * which entities (write path), and which entities a query names (read path).
 * Both are deterministic string matching — no model call on either hot path.
 */
import { describe, expect, it } from 'vitest';

import { findSeedEntities, matchEntityMentions, mentionsName } from '../entities';

const SARAH = { id: 'e-sarah', name: 'Sarah Chen', aliases: ['Sarah'] };
const ZAP = { id: 'e-zap', name: 'Zap Corp', aliases: [] as string[] };

describe('mentionsName', () => {
    it('matches on whole tokens, not substrings', () => {
        expect(mentionsName('she works at zap', 'zap')).toBe(true);
        expect(mentionsName('she works at zapier', 'zap')).toBe(false);
    });

    it('matches multi-word names', () => {
        expect(mentionsName('sarah chen ships on fridays', 'sarah chen')).toBe(true);
        expect(mentionsName('sarah ships on fridays', 'sarah chen')).toBe(false);
    });

    it('ignores names too short to be evidence', () => {
        expect(mentionsName('j is on the team', 'j')).toBe(false);
    });
});

describe('matchEntityMentions', () => {
    it('links a memory to every entity it names, by name or alias', () => {
        const mentions = matchEntityMentions(
            [SARAH, ZAP],
            [
                { id: 'm1', content: 'Sarah works at Zap Corp.' },
                { id: 'm2', content: 'Sarah prefers async standups.' },
                { id: 'm3', content: 'The deploy runs on Fridays.' },
            ]
        );

        expect(mentions).toEqual([
            { entityId: 'e-sarah', memoryId: 'm1' },
            { entityId: 'e-zap', memoryId: 'm1' },
            // Alias-only mention — the fact that pure edges would never link.
            { entityId: 'e-sarah', memoryId: 'm2' },
        ]);
    });

    it('is punctuation- and case-insensitive', () => {
        const mentions = matchEntityMentions([ZAP], [{ id: 'm1', content: 'Joined ZAP CORP, remotely.' }]);
        expect(mentions).toHaveLength(1);
    });

    it('links a first-name mention to the full-name entity', () => {
        // The common case: the entity is stored as "Sarah Chen", but the fact
        // that matters says "Sarah". No alias exists yet.
        const mentions = matchEntityMentions(
            [{ id: 'e-sarah', name: 'Sarah Chen', aliases: [] }],
            [{ id: 'm1', content: 'Sarah prefers async standups.' }]
        );
        expect(mentions).toEqual([{ entityId: 'e-sarah', memoryId: 'm1' }]);
    });

    it('refuses an ambiguous short name rather than guessing', () => {
        const mentions = matchEntityMentions(
            [
                { id: 'e-chen', name: 'Sarah Chen', aliases: [] },
                { id: 'e-park', name: 'Sarah Park', aliases: [] },
            ],
            [{ id: 'm1', content: 'Sarah prefers async standups.' }]
        );
        expect(mentions).toEqual([]);
    });

    it('never links on a generic name part alone', () => {
        const mentions = matchEntityMentions(
            [{ id: 'e-zap', name: 'Zap Corp', aliases: [] }],
            [{ id: 'm1', content: 'Corp policy allows remote work.' }]
        );
        expect(mentions).toEqual([]);
    });

    it('returns nothing when either side is empty', () => {
        expect(matchEntityMentions([], [{ id: 'm1', content: 'Sarah' }])).toEqual([]);
        expect(matchEntityMentions([SARAH], [])).toEqual([]);
    });
});

describe('findSeedEntities', () => {
    it('seeds traversal from the entities a query names', () => {
        expect(findSeedEntities('where does Sarah work from?', [SARAH, ZAP])).toEqual(['e-sarah']);
    });

    it('finds several seeds in one query', () => {
        expect(findSeedEntities('is Sarah still at Zap Corp?', [SARAH, ZAP])).toEqual(['e-sarah', 'e-zap']);
    });

    it('seeds from a first name when it identifies one entity', () => {
        expect(findSeedEntities('where does Sarah work?', [{ id: 'e-sarah', name: 'Sarah Chen', aliases: [] }]))
            .toEqual(['e-sarah']);
    });

    it('returns nothing when the query names no known entity', () => {
        expect(findSeedEntities('what is my deploy cadence?', [SARAH, ZAP])).toEqual([]);
        expect(findSeedEntities('   ', [SARAH, ZAP])).toEqual([]);
    });
});
