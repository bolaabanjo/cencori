/**
 * @vitest-environment node
 *
 * Phase 3.5 progressive disclosure. Index mode must show a compact TOC (ids +
 * summaries), never full contents, and default recall must stay 'inject'.
 */
import { describe, expect, it } from 'vitest';

import { parseMemoryDirective } from '../types';
import {
    memorySummary,
    buildMemoryIndexBlock,
    buildMemoryBlock,
    buildMemorySystemBlock,
    MEMORY_SUMMARY_MAX_CHARS,
} from '../retrieval';
import type { RetrievedMemory } from '../types';

const mem = (id: string, content: string): RetrievedMemory => ({
    id, content, similarity: 0.8, namespace: null, importance: 0.7, createdAt: null,
});

describe('parseMemoryDirective mode', () => {
    it('defaults to inject', () => {
        const r = parseMemoryDirective({ userId: 'u' });
        expect(r.ok && r.directive.mode).toBe('inject');
    });
    it('accepts index', () => {
        const r = parseMemoryDirective({ userId: 'u', mode: 'index' });
        expect(r.ok && r.directive.mode).toBe('index');
    });
    it('falls back to inject for unknown values', () => {
        const r = parseMemoryDirective({ userId: 'u', mode: 'weird' as never });
        expect(r.ok && r.directive.mode).toBe('inject');
    });
});

describe('memorySummary', () => {
    it('returns short content unchanged', () => {
        expect(memorySummary('User prefers dark mode')).toBe('User prefers dark mode');
    });
    it('collapses whitespace', () => {
        expect(memorySummary('User   likes\n\ttabs')).toBe('User likes tabs');
    });
    it('truncates long content at a word boundary with an ellipsis', () => {
        const long = 'The user is building a fintech application called Ledgerkit for small businesses across several African markets';
        const s = memorySummary(long);
        expect(s.length).toBeLessThanOrEqual(MEMORY_SUMMARY_MAX_CHARS + 1); // +1 for ellipsis
        expect(s.endsWith('…')).toBe(true);
        expect(s).not.toContain('  ');
        // Word-boundary cut: no partial trailing word before the ellipsis.
        expect(long.startsWith(s.replace('…', '').trim())).toBe(true);
    });
});

describe('buildMemoryIndexBlock', () => {
    const mems = [mem('mem_a', 'User uses Rust'), mem('mem_b', 'User prefers dark mode')];

    it('lists each memory as [id] summary and never dumps other content', () => {
        const block = buildMemoryIndexBlock(mems);
        expect(block).toContain('- [mem_a] User uses Rust');
        expect(block).toContain('- [mem_b] User prefers dark mode');
    });
    it('instructs the model to fetch full notes by id on demand', () => {
        const block = buildMemoryIndexBlock(mems);
        expect(block.toLowerCase()).toContain('fetch');
        expect(block).toContain('/v1/memory/:id');
    });
});

describe('buildMemoryBlock dispatch', () => {
    const mems = [mem('mem_a', 'User uses Rust')];
    it("mode 'inject' produces the full-content block", () => {
        expect(buildMemoryBlock(mems, 'inject')).toBe(buildMemorySystemBlock(mems));
    });
    it("mode 'index' produces the TOC block", () => {
        expect(buildMemoryBlock(mems, 'index')).toBe(buildMemoryIndexBlock(mems));
    });
});
