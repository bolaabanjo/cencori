import { describe, expect, it } from 'vitest';
import { parseExtractionOutput } from '../extraction';

describe('parseExtractionOutput', () => {
    it('parses a clean JSON array', () => {
        const out = parseExtractionOutput(
            '[{"fact": "Prefers dark mode", "importance": 0.7}]'
        );
        expect(out).toEqual([{ content: 'Prefers dark mode', importance: 0.7 }]);
    });

    it('strips code fences', () => {
        const out = parseExtractionOutput(
            '```json\n[{"fact": "Uses TypeScript", "importance": 0.8}]\n```'
        );
        expect(out).toEqual([{ content: 'Uses TypeScript', importance: 0.8 }]);
    });

    it('extracts the array from surrounding prose', () => {
        const out = parseExtractionOutput(
            'Here are the facts:\n[{"fact": "Building Ledgerkit", "importance": 0.9}]\nDone.'
        );
        expect(out).toEqual([{ content: 'Building Ledgerkit', importance: 0.9 }]);
    });

    it('accepts "content" as an alias for "fact"', () => {
        const out = parseExtractionOutput('[{"content": "Deploys on Vercel", "importance": 0.6}]');
        expect(out).toEqual([{ content: 'Deploys on Vercel', importance: 0.6 }]);
    });

    it('returns [] on malformed JSON', () => {
        expect(parseExtractionOutput('not json')).toEqual([]);
        expect(parseExtractionOutput('{"fact": "not an array"}')).toEqual([]);
        expect(parseExtractionOutput('')).toEqual([]);
    });

    it('defaults missing importance to 0.5 and clamps out-of-range values', () => {
        const out = parseExtractionOutput(
            '[{"fact": "A"}, {"fact": "B", "importance": 5}, {"fact": "C", "importance": -1}]'
        );
        expect(out).toEqual([
            { content: 'A', importance: 0.5 },
            { content: 'B', importance: 1 },
            { content: 'C', importance: 0 },
        ]);
    });

    it('drops entries without usable content', () => {
        const out = parseExtractionOutput(
            '[{"importance": 0.9}, {"fact": "   "}, null, "string", {"fact": "Valid", "importance": 0.6}]'
        );
        expect(out).toEqual([{ content: 'Valid', importance: 0.6 }]);
    });

    it('handles the empty-array response', () => {
        expect(parseExtractionOutput('[]')).toEqual([]);
    });
});
