/**
 * POST /v1/memory/graph — extract entities + relations from a {user, assistant}
 *   exchange and persist them into the memory graph (Layer 5 write path).
 * GET  /v1/memory/graph  — traverse the graph outward from an entity
 *   (?userId=&entity=Sarah&hops=2), returning connected entities + relations.
 *
 * Managed, Google-only extraction. Org/project always from the auth context.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
} from '@/lib/gateway-middleware';
import type { SubscriptionTier } from '@/lib/entitlements';
import {
    getProjectMemorySettings,
    extractEntities,
    persistEntityGraph,
    traverseGraph,
    normalizeName,
    type GraphEdge,
} from '@/lib/memory';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

function resolveScopeKey(scope: string, userId: string, sessionId: string): string {
    return scope === 'session' ? sessionId || userId : userId;
}

// ── Write: extract + persist ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        const settings = await getProjectMemorySettings(ctx.supabase, ctx.projectId);
        if (!settings.enabled) {
            return respond({ error: 'memory_disabled', message: 'Memory is disabled for this project.' }, 403);
        }

        const body = await req.json();
        const scope = typeof body.scope === 'string' ? body.scope : 'user';
        const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
        const namespace = typeof body.namespace === 'string' && body.namespace.trim() ? body.namespace.trim() : null;
        const scopeKey = resolveScopeKey(scope, userId, sessionId);
        if (!scopeKey) {
            return respond({ error: 'bad_request', message: 'userId is required (or sessionId for session scope).' }, 400);
        }

        const userText = typeof body.user === 'string' ? body.user : typeof body.text === 'string' ? body.text : '';
        const assistantText = typeof body.assistant === 'string' ? body.assistant : '';
        if (!userText.trim() && !assistantText.trim()) {
            return respond({ error: 'bad_request', message: 'Provide `user` and/or `assistant` text (or `text`).' }, 400);
        }

        const { extraction, costUsd } = await extractEntities({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            organizationId: ctx.organizationId,
            tier: ctx.tier as SubscriptionTier,
            model: settings.extractionModel,
            userText,
            assistantText,
            requestId: ctx.requestId,
        });

        const persisted = await persistEntityGraph({
            supabase: ctx.supabase,
            organizationId: ctx.organizationId,
            projectId: ctx.projectId,
            scope,
            scopeKey,
            namespace,
            extraction,
        });

        return respond(
            {
                entities: persisted.entitiesCreated + persisted.entitiesMerged,
                created: persisted.entitiesCreated,
                merged: persisted.entitiesMerged,
                relations: persisted.edgesCreated,
                costUsd,
            },
            200
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return respond({ error: 'internal_error', message }, 500);
    }
}

// ── Read: traverse from an entity ────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        const url = new URL(req.url);
        const scope = url.searchParams.get('scope') || 'user';
        const userId = url.searchParams.get('userId')?.trim() || '';
        const sessionId = url.searchParams.get('sessionId')?.trim() || '';
        const namespace = url.searchParams.get('namespace')?.trim() || null;
        const entityQuery = url.searchParams.get('entity')?.trim() || '';
        const hops = Math.min(4, Math.max(1, parseInt(url.searchParams.get('hops') || '2', 10) || 2));
        const scopeKey = resolveScopeKey(scope, userId, sessionId);
        if (!scopeKey) {
            return respond({ error: 'bad_request', message: 'userId is required (or sessionId for session scope).' }, 400);
        }
        if (!entityQuery) {
            return respond({ error: 'bad_request', message: '`entity` (name to start from) is required.' }, 400);
        }

        // Load the scope's entities + edges (tenant-filtered in SQL).
        let entQuery = ctx.supabase
            .from('memory_entities')
            .select('id, name, entity_type, canonical_key, aliases')
            .eq('organization_id', ctx.organizationId)
            .eq('project_id', ctx.projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey);
        if (namespace) entQuery = entQuery.eq('namespace', namespace);
        const { data: entities, error: entErr } = await entQuery;
        if (entErr) return respond({ error: 'internal_error', message: entErr.message }, 500);

        const norm = normalizeName(entityQuery);
        const seed = (entities ?? []).find(
            (e) => normalizeName(e.name) === norm || ((e.aliases as string[] | null) ?? []).some((a) => normalizeName(a) === norm)
        );
        if (!seed) {
            return respond({ seed: null, nodes: [], edges: [], message: `No entity matching "${entityQuery}".` }, 200);
        }

        let edgeQuery = ctx.supabase
            .from('memory_entity_edges')
            .select('src_entity_id, dst_entity_id, relation')
            .eq('organization_id', ctx.organizationId)
            .eq('project_id', ctx.projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey);
        if (namespace) edgeQuery = edgeQuery.eq('namespace', namespace);
        const { data: edgeRows, error: edgeErr } = await edgeQuery;
        if (edgeErr) return respond({ error: 'internal_error', message: edgeErr.message }, 500);

        const edges: GraphEdge[] = (edgeRows ?? []).map((e) => ({
            src: e.src_entity_id,
            dst: e.dst_entity_id,
            relation: e.relation,
        }));

        const hits = traverseGraph([seed.id], edges, { maxHops: hops, undirected: true });
        const byId = new Map((entities ?? []).map((e) => [e.id, e]));

        const nodes = hits.map((h) => {
            const e = byId.get(h.entityId);
            return { id: h.entityId, name: e?.name ?? '?', type: e?.entity_type ?? 'entity', hops: h.hops, path: h.path };
        });

        // Return only edges among the reached nodes.
        const reached = new Set(hits.map((h) => h.entityId));
        const connectedEdges = edges
            .filter((e) => reached.has(e.src) && reached.has(e.dst))
            .map((e) => ({
                source: byId.get(e.src)?.name ?? e.src,
                relation: e.relation,
                target: byId.get(e.dst)?.name ?? e.dst,
            }));

        return respond({ seed: { id: seed.id, name: seed.name, type: seed.entity_type }, nodes, edges: connectedEdges }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return respond({ error: 'internal_error', message }, 500);
    }
}
