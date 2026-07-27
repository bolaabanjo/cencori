/**
 * Paginate past PostgREST's per-request row ceiling (Supabase default: 1000).
 *
 * A plain `.select()` silently returns at most `max-rows` rows, so any metric
 * computed as `rows.length` or `rows.reduce(...)` under-reports once a project
 * crosses that ceiling (the "totals cap at 1000" bug). This walks `.range()`
 * pages until the source is exhausted (or `maxRows` is hit), so callers
 * aggregate over the COMPLETE set.
 *
 * Correctness: give the query a STABLE order (e.g. created_at) so page
 * boundaries don't drift. Pass a `page(from, to)` builder that applies
 * `.range(from, to)` to a fresh query each call.
 *
 * This is the interim-correct fix. The scale-grade path is DB-side aggregation
 * (SUM/COUNT/percentile in SQL via an RPC) so we never ship rows to Node at all;
 * swap to that when per-window volume gets large.
 */

interface PageResult<T> {
    data: T[] | null;
    error: { message: string } | null;
}

export async function fetchAllRows<T>(
    page: (from: number, to: number) => PromiseLike<PageResult<T>>,
    opts: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
    // pageSize must not exceed the server's max-rows (default 1000), or a full
    // page reads short and the walk stops early.
    const pageSize = opts.pageSize ?? 1000;
    const maxRows = opts.maxRows ?? 100_000;
    const rows: T[] = [];

    for (let from = 0; from < maxRows; from += pageSize) {
        const to = Math.min(from + pageSize, maxRows) - 1;
        const { data, error } = await page(from, to);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break; // last (partial) page
    }

    return rows;
}
