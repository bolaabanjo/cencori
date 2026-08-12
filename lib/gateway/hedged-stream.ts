export type HedgedStreamSource = 'primary' | 'secondary';

export type HedgedStreamValue<T> = {
    source: HedgedStreamSource;
    value: T;
};

type FirstResult<T> =
    | { ok: true; iterator: AsyncIterator<T>; value: T }
    | { ok: false; error: unknown };

async function firstUsable<T>(
    iterableFactory: () => AsyncIterable<T> | Promise<AsyncIterable<T>>,
    isUsable: (value: T) => boolean
): Promise<FirstResult<T>> {
    try {
        const iterable = await iterableFactory();
        const iterator = iterable[Symbol.asyncIterator]();
        while (true) {
            const next = await iterator.next();
            if (next.done) return { ok: false, error: new Error('Stream ended before usable output') };
            if (isUsable(next.value)) return { ok: true, iterator, value: next.value };
        }
    } catch (error) {
        return { ok: false, error };
    }
}

/**
 * Start the secondary only when the primary has not produced usable output by
 * delayMs. The first usable stream wins and the loser is cancelled.
 */
export async function* hedgedStream<T>(params: {
    primary: () => AsyncIterable<T> | Promise<AsyncIterable<T>>;
    secondary: () => AsyncIterable<T> | Promise<AsyncIterable<T>>;
    delayMs: number;
    isUsable: (value: T) => boolean;
}): AsyncGenerator<HedgedStreamValue<T>> {
    const primaryFirst = firstUsable(params.primary, params.isUsable);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let secondaryStarted = false;
    let secondaryFirst: Promise<FirstResult<T>> | null = null;

    const startSecondary = () => {
        if (!secondaryFirst) {
            secondaryStarted = true;
            secondaryFirst = firstUsable(params.secondary, params.isUsable);
        }
        return secondaryFirst;
    };

    const delayedSecondary = new Promise<FirstResult<T>>((resolve) => {
        timer = setTimeout(() => {
            void startSecondary().then(resolve);
        }, Math.max(0, params.delayMs));
    });

    let primaryResult: FirstResult<T> | null = null;
    let secondaryResult: FirstResult<T> | null = null;
    let source: HedgedStreamSource;
    let winner: Extract<FirstResult<T>, { ok: true }>;

    const first = await Promise.race([
        primaryFirst.then((result) => ({ source: 'primary' as const, result })),
        delayedSecondary.then((result) => ({ source: 'secondary' as const, result })),
    ]);

    if (first.source === 'primary') primaryResult = first.result;
    else secondaryResult = first.result;

    if (first.result.ok) {
        source = first.source;
        winner = first.result;
    } else if (first.source === 'primary') {
        if (timer) clearTimeout(timer);
        secondaryResult = await startSecondary();
        if (!secondaryResult.ok) throw secondaryResult.error;
        source = 'secondary';
        winner = secondaryResult;
    } else {
        primaryResult = await primaryFirst;
        if (!primaryResult.ok) throw primaryResult.error;
        source = 'primary';
        winner = primaryResult;
    }

    if (timer) clearTimeout(timer);

    // Cancel an already-started loser. If the secondary timer never fired,
    // clearing it above guarantees the duplicate request is never created.
    if (source === 'primary' && secondaryStarted) {
        void secondaryFirst!.then(async (result) => {
            if (result.ok) await result.iterator.return?.();
        });
    } else if (source === 'secondary') {
        void primaryFirst.then(async (result) => {
            if (result.ok) await result.iterator.return?.();
        });
    }

    try {
        yield { source, value: winner.value };
        while (true) {
            const next = await winner.iterator.next();
            if (next.done) return;
            yield { source, value: next.value };
        }
    } finally {
        await winner.iterator.return?.();
    }
}
