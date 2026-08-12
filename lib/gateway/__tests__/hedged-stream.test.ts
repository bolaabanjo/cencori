import { describe, expect, it, vi } from 'vitest';
import { hedgedStream } from '@/lib/gateway/hedged-stream';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const values: T[] = [];
    for await (const value of iterable) values.push(value);
    return values;
}

describe('hedgedStream', () => {
    it('does not start the secondary when primary wins before the threshold', async () => {
        const secondary = vi.fn(async function* () { yield 'secondary'; });
        const values = await collect(hedgedStream({
            primary: async function* () { yield 'primary'; yield 'done'; },
            secondary,
            delayMs: 50,
            isUsable: Boolean,
        }));

        expect(values.map((item) => item.value)).toEqual(['primary', 'done']);
        expect(secondary).not.toHaveBeenCalled();
    });

    it('uses the secondary when the primary misses the threshold', async () => {
        let releasePrimary!: () => void;
        const primaryGate = new Promise<void>((resolve) => { releasePrimary = resolve; });
        const values = await collect(hedgedStream({
            primary: async function* () { await primaryGate; yield 'primary'; },
            secondary: async function* () { yield 'secondary'; yield 'done'; },
            delayMs: 1,
            isUsable: Boolean,
        }));
        releasePrimary();

        expect(values.map((item) => item.value)).toEqual(['secondary', 'done']);
        expect(values.every((item) => item.source === 'secondary')).toBe(true);
    });
});
