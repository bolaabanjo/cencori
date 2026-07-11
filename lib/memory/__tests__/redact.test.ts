import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchAndProcessCustomRules = vi.fn();

vi.mock('@/lib/gateway/custom-rules', () => ({
    fetchAndProcessCustomRules: (...args: unknown[]) => fetchAndProcessCustomRules(...args),
}));

import { redactFact } from '../redact';

const supabase = {} as never;

describe('redactFact', () => {
    beforeEach(() => {
        fetchAndProcessCustomRules.mockReset();
    });

    it('stores the processed (redacted) content, not the raw', async () => {
        fetchAndProcessCustomRules.mockResolvedValue({
            rules: [{}],
            inputResult: {
                content: 'SSN is [REDACTED]',
                wasProcessed: true,
                matchedRules: ['ssn-rule'],
                shouldBlock: false,
            },
        });

        const result = await redactFact(supabase, 'proj_1', 'SSN is 123-45-6789');
        expect(result).toEqual({ content: 'SSN is [REDACTED]', redactions: 1, blocked: false });
    });

    it('marks blocked facts so callers drop them', async () => {
        fetchAndProcessCustomRules.mockResolvedValue({
            rules: [{}],
            inputResult: {
                content: 'whatever',
                wasProcessed: true,
                matchedRules: ['block-rule'],
                shouldBlock: true,
            },
        });

        const result = await redactFact(supabase, 'proj_1', 'forbidden content');
        expect(result.blocked).toBe(true);
    });

    it('passes through unchanged when no rules match', async () => {
        fetchAndProcessCustomRules.mockResolvedValue({
            rules: [],
            inputResult: {
                content: 'Prefers dark mode',
                wasProcessed: false,
                matchedRules: [],
                shouldBlock: false,
            },
        });

        const result = await redactFact(supabase, 'proj_1', 'Prefers dark mode');
        expect(result).toEqual({ content: 'Prefers dark mode', redactions: 0, blocked: false });
    });

    it('fails open (passthrough) when rules processing throws', async () => {
        fetchAndProcessCustomRules.mockRejectedValue(new Error('rules service down'));

        const result = await redactFact(supabase, 'proj_1', 'some fact');
        expect(result).toEqual({ content: 'some fact', redactions: 0, blocked: false });
    });
});
