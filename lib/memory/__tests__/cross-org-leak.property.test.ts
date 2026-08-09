/**
 * Zero cross-org leakage — contract-level property test.
 *
 * Whatever adversarial identifiers appear in a directive (fake org ids,
 * SQL-ish scope keys, other projects' uuids), every RPC call must carry the
 * authenticated context's organization/project ids, and every insert row
 * must be stamped with them. The SQL-side enforcement (org filter inside
 * match_gateway_memories) is covered by the integration contract test; this
 * guards the app layer.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { retrieveMemories } from '../retrieval';
import { writeMemories } from '../writeback';
import { parseMemoryDirective, type MemoryDirective } from '../types';

vi.mock('../embeddings', () => ({
    MEMORY_EMBEDDING_MODEL: 'text-embedding-3-small',
    embedForMemory: vi.fn(async (_s: unknown, _p: string, _o: string, input: string | string[]) => ({
        embeddings: (Array.isArray(input) ? input : [input]).map(() => [0.1, 0.2]),
        totalTokens: 10,
        providerCostUsd: 0,
        cencoriChargeUsd: 0,
        markupPercentage: 0,
    })),
}));

vi.mock('../redact', () => ({
    redactFact: vi.fn(async (_s: unknown, _p: string, text: string) => ({
        content: text,
        redactions: 0,
        blocked: false,
    })),
}));

const CTX_ORG = '11111111-1111-1111-1111-111111111111';
const CTX_PROJECT = '22222222-2222-2222-2222-222222222222';

const ADVERSARIAL_KEYS = [
    'user_1',
    '33333333-3333-3333-3333-333333333333', // another org's uuid as a scope key
    "user' or 1=1 --",
    '../../org-b',
    'p_org_id',
];

const ADVERSARIAL_DIRECTIVE_EXTRAS = [
    {},
    { organizationId: '99999999-9999-9999-9999-999999999999' },
    { orgId: '99999999-9999-9999-9999-999999999999' },
    { projectId: '88888888-8888-8888-8888-888888888888' },
    { p_org_id: '77777777-7777-7777-7777-777777777777' },
];

function buildDirective(extra: Record<string, unknown>, scopeKey: string): MemoryDirective {
    const parsed = parseMemoryDirective({ userId: scopeKey, ...extra });
    if (!parsed.ok) throw new Error(`fixture should parse: ${parsed.error}`);
    return parsed.directive;
}

/**
 * Graph fixtures: enough of an entity graph that recall actually walks it, so
 * the Layer-5 queries are exercised rather than short-circuited.
 */
const GRAPH_ENTITY = 'Zap Corp';
const TABLE_ROWS: Record<string, unknown[]> = {
    memory_entities: [{ id: 'e-1', name: GRAPH_ENTITY, aliases: [] }],
    memory_entity_edges: [],
    memory_entity_mentions: [{ entity_id: 'e-1', memory_id: 'm-1' }],
    gateway_memories: [
        { id: 'm-1', content: 'Zap Corp runs a four-day week.', namespace: null, importance: 0.5, created_at: null },
    ],
};

/** Every table query made, with the filters it carried. */
interface RecordedQuery {
    table: string;
    filters: Record<string, unknown>;
}

describe('cross-org leak resistance (app layer)', () => {
    let rpcSpy: ReturnType<typeof vi.fn>;
    let insertedRows: Record<string, unknown>[];
    let queries: RecordedQuery[];
    let supabase: never;

    beforeEach(() => {
        rpcSpy = vi.fn(async () => ({ data: [], error: null }));
        insertedRows = [];
        queries = [];
        supabase = {
            rpc: rpcSpy,
            from: vi.fn((table: string) => {
                const filters: Record<string, unknown> = {};
                queries.push({ table, filters });

                const chain: Record<string, unknown> = {};
                chain.select = () => chain;
                chain.eq = (column: string, value: unknown) => {
                    filters[column] = value;
                    return chain;
                };
                chain.in = () => chain;
                chain.limit = () => chain;
                // Awaited directly by both the quota count and the graph loads.
                chain.then = (resolve: (v: unknown) => void) =>
                    resolve({ data: TABLE_ROWS[table] ?? [], count: 0, error: null });
                chain.insert = (rows: Record<string, unknown>[]) => {
                    insertedRows.push(...rows);
                    return {
                        select: vi.fn(async () => ({
                            data: rows.map((_, i) => ({ id: `id-${i}`, content: 'x', importance: 0.5 })),
                            error: null,
                        })),
                    };
                };
                return chain;
            }),
        } as never;
    });

    it('retrieval always queries with ctx org/project regardless of directive content', async () => {
        for (const extra of ADVERSARIAL_DIRECTIVE_EXTRAS) {
            for (const scopeKey of ADVERSARIAL_KEYS) {
                rpcSpy.mockClear();
                const directive = buildDirective(extra, scopeKey);

                await retrieveMemories({
                    supabase,
                    organizationId: CTX_ORG,
                    projectId: CTX_PROJECT,
                    directive,
                    queryText: 'what do you know about me?',
                });

                const [fn, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
                expect(fn).toBe('match_gateway_memories_ranked');
                expect(args.p_org_id).toBe(CTX_ORG);
                expect(args.p_project_id).toBe(CTX_PROJECT);
                // The adversarial values must never surface as org/project.
                expect(args.p_org_id).not.toBe('99999999-9999-9999-9999-999999999999');
                expect(args.p_project_id).not.toBe('88888888-8888-8888-8888-888888888888');
                // scope_key passes through as data, not as an identifier.
                expect(args.p_scope_key).toBe(directive.scopeKey);
            }
        }
    });

    it('graph-expanded recall queries only ever carry ctx org/project', async () => {
        for (const extra of ADVERSARIAL_DIRECTIVE_EXTRAS) {
            for (const scopeKey of ADVERSARIAL_KEYS) {
                queries.length = 0;
                rpcSpy.mockClear();
                const directive = buildDirective(extra, scopeKey);

                await retrieveMemories({
                    supabase,
                    organizationId: CTX_ORG,
                    projectId: CTX_PROJECT,
                    directive,
                    // Names a known entity, so the walk really runs.
                    queryText: `what do you know about ${GRAPH_ENTITY}?`,
                });

                const graphQueries = queries.filter(q =>
                    q.table === 'memory_entities' ||
                    q.table === 'memory_entity_edges' ||
                    q.table === 'memory_entity_mentions' ||
                    q.table === 'gateway_memories'
                );
                // The walk must have happened, or this proves nothing.
                expect(graphQueries.length).toBeGreaterThan(0);

                for (const query of graphQueries) {
                    expect(query.filters.organization_id).toBe(CTX_ORG);
                    expect(query.filters.project_id).toBe(CTX_PROJECT);
                    expect(query.filters.scope_key ?? directive.scopeKey).toBe(directive.scopeKey);
                }

                // Reinforcement of graph hits is scoped to the ctx org too.
                const touch = rpcSpy.mock.calls.find(([fn]) => fn === 'touch_gateway_memories');
                if (touch) expect((touch[1] as Record<string, unknown>).p_org_id).toBe(CTX_ORG);
            }
        }
    });

    it('writes always stamp rows with ctx org/project regardless of directive content', async () => {
        for (const extra of ADVERSARIAL_DIRECTIVE_EXTRAS) {
            for (const scopeKey of ADVERSARIAL_KEYS) {
                insertedRows.length = 0;
                const directive = buildDirective(extra, scopeKey);

                await writeMemories({
                    supabase,
                    organizationId: CTX_ORG,
                    projectId: CTX_PROJECT,
                    tier: 'free',
                    scope: 'user',
                    scopeKey: directive.scopeKey,
                    namespace: directive.namespace,
                    facts: [{ content: 'Prefers dark mode', importance: 0.8 }],
                });

                expect(insertedRows.length).toBe(1);
                for (const row of insertedRows) {
                    expect(row.organization_id).toBe(CTX_ORG);
                    expect(row.project_id).toBe(CTX_PROJECT);
                }
            }
        }
    });
});
