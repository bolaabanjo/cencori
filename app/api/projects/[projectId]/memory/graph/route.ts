/**
 * GET /api/projects/:projectId/memory/graph — inspect the entity graph.
 *
 * Two modes:
 *   ?userId=...            → the entities known for that end-user (most
 *                            mentioned first) plus every relation between them.
 *   ?userId=...&entity=... → the walk outward from one entity, with hop counts.
 *
 * Read-only. Traversal is the same pure function recall uses, so what the
 * dashboard draws is what the model would actually reach.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { normalizeName, traverseGraph, type GraphEdge } from '@/lib/memory';

const MAX_ENTITIES = 300;
/** Users returned per page of the picker — a page, never the whole set. */
const USER_PAGE_SIZE = 20;
/** Entity rows scanned by the pre-migration fallback user list. */
const FALLBACK_USER_SCAN = 1000;

/**
 * User list without the aggregation function — only for the window between
 * deploying this code and applying its migration. Scans a capped slice of
 * entity rows, so on a large project it shows *some* users rather than the
 * biggest ones. The RPC path is the correct one.
 */
async function fallbackUserList(
    supabase: ReturnType<typeof createAdminClient>,
    organizationId: string,
    projectId: string,
    search: string
) {
    const { data: rows } = await supabase
        .from('memory_entities')
        .select('scope_key, mention_count')
        .eq('organization_id', organizationId)
        .eq('project_id', projectId)
        .limit(FALLBACK_USER_SCAN);

    const byUser = new Map<string, { entities: number; mentions: number }>();
    for (const row of rows ?? []) {
        const key = row.scope_key as string;
        if (search && !key.toLowerCase().includes(search.toLowerCase())) continue;
        const acc = byUser.get(key) ?? { entities: 0, mentions: 0 };
        acc.entities++;
        acc.mentions += Number(row.mention_count ?? 1);
        byUser.set(key, acc);
    }

    const users = [...byUser.entries()]
        .map(([scopeKey, acc]) => ({ scopeKey, ...acc }))
        .sort((a, b) => b.entities - a.entities);

    return {
        users: users.slice(0, USER_PAGE_SIZE),
        totalUsers: users.length,
        search,
        approximate: true,
        entities: [],
        edges: [],
    };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId);
    if (!access.ok) return access.response;

    const supabase = createAdminClient();
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') || 'user';
    const scopeKey = url.searchParams.get('userId')?.trim() || '';
    const entityQuery = url.searchParams.get('entity')?.trim() || '';
    const hops = Math.min(4, Math.max(1, parseInt(url.searchParams.get('hops') || '2', 10) || 2));

    try {
        // No user selected yet: return a bounded, searchable page of users who
        // have a graph. Aggregated in SQL — a project can have more end-users
        // than anyone would ever scroll, so this is never "the whole list".
        if (!scopeKey) {
            const search = url.searchParams.get('userSearch')?.trim() || '';
            const { data: rows, error } = await supabase.rpc('memory_graph_users', {
                p_org_id: access.organizationId,
                p_project_id: projectId,
                p_search: search || null,
                p_limit: USER_PAGE_SIZE,
            });

            if (error) {
                // Pre-migration: degrade to a small scan rather than an error.
                console.warn('[Memory] Graph-users RPC unavailable, falling back:', error.message);
                return NextResponse.json(await fallbackUserList(supabase, access.organizationId, projectId, search));
            }

            const users = (rows ?? []) as Array<{
                scope_key: string;
                entity_count: number;
                mention_total: number;
                total_matches: number;
            }>;

            return NextResponse.json({
                users: users.map(u => ({
                    scopeKey: u.scope_key,
                    entities: Number(u.entity_count),
                    mentions: Number(u.mention_total),
                })),
                totalUsers: Number(users[0]?.total_matches ?? 0),
                search,
                entities: [],
                edges: [],
            });
        }

        const { data: entityRows, error: entityError } = await supabase
            .from('memory_entities')
            .select('id, name, entity_type, aliases, mention_count, created_at')
            .eq('organization_id', access.organizationId)
            .eq('project_id', projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey)
            .order('mention_count', { ascending: false })
            .limit(MAX_ENTITIES);
        if (entityError) throw entityError;

        const { data: edgeRows, error: edgeError } = await supabase
            .from('memory_entity_edges')
            .select('src_entity_id, dst_entity_id, relation, source_memory_id')
            .eq('organization_id', access.organizationId)
            .eq('project_id', projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey);
        if (edgeError) throw edgeError;

        const byId = new Map((entityRows ?? []).map(e => [e.id as string, e]));
        const edges: GraphEdge[] = (edgeRows ?? []).map(e => ({
            src: e.src_entity_id as string,
            dst: e.dst_entity_id as string,
            relation: e.relation as string,
        }));

        // How many facts each entity is attached to — the "what do you actually
        // know about this node" number.
        const { data: mentionRows } = await supabase
            .from('memory_entity_mentions')
            .select('entity_id')
            .eq('organization_id', access.organizationId)
            .eq('project_id', projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey);
        const factsByEntity = new Map<string, number>();
        for (const row of mentionRows ?? []) {
            const id = row.entity_id as string;
            factsByEntity.set(id, (factsByEntity.get(id) ?? 0) + 1);
        }

        const describe = (id: string, hopCount?: number, path?: string[]) => {
            const entity = byId.get(id);
            return {
                id,
                name: (entity?.name as string) ?? '?',
                type: (entity?.entity_type as string) ?? 'entity',
                aliases: (entity?.aliases as string[] | null) ?? [],
                mentionCount: Number(entity?.mention_count ?? 0),
                facts: factsByEntity.get(id) ?? 0,
                ...(hopCount != null ? { hops: hopCount } : {}),
                ...(path ? { path } : {}),
            };
        };

        // Walk from one entity when asked; otherwise return the whole scope.
        if (entityQuery) {
            const norm = normalizeName(entityQuery);
            const seed = (entityRows ?? []).find(e =>
                normalizeName(e.name as string) === norm ||
                ((e.aliases as string[] | null) ?? []).some(a => normalizeName(a) === norm)
            );
            if (!seed) {
                return NextResponse.json({ seed: null, entities: [], edges: [], message: `No entity matching "${entityQuery}".` });
            }

            const hits = traverseGraph([seed.id as string], edges, { maxHops: hops, undirected: true });
            const reached = new Set(hits.map(h => h.entityId));

            return NextResponse.json({
                seed: describe(seed.id as string),
                entities: hits.map(h => describe(h.entityId, h.hops, h.path)),
                edges: edges
                    .filter(e => reached.has(e.src) && reached.has(e.dst))
                    .map(e => ({
                        source: byId.get(e.src)?.name ?? e.src,
                        relation: e.relation,
                        target: byId.get(e.dst)?.name ?? e.dst,
                    })),
            });
        }

        return NextResponse.json({
            seed: null,
            entities: (entityRows ?? []).map(e => describe(e.id as string)),
            edges: edges.map(e => ({
                source: byId.get(e.src)?.name ?? e.src,
                relation: e.relation,
                target: byId.get(e.dst)?.name ?? e.dst,
            })),
        });
    } catch (error) {
        console.error('[Memory] Graph error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
