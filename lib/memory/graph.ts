/**
 * Memory graph traversal — Phase 3, Layer 5.
 *
 * Multi-hop recall: pure vector similarity can answer "what is Sarah's role?"
 * (a fact) but not "who does Sarah report to, and where do they work?" (a walk
 * across relations). Given seed entities (resolved from the query) and the edge
 * set, this walks outward N hops and returns the reachable entities with the
 * path that reached each — the substrate for graph-aware recall.
 *
 * Pure and deterministic — no DB or model calls. The caller loads the scoped
 * edge set (tenant-filtered in SQL, same boundary as everything else) and
 * passes it here. Cycle-safe and hop-bounded.
 */

export interface GraphEdge {
    src: string;
    dst: string;
    relation: string;
    weight?: number;
}

export interface TraversalHit {
    entityId: string;
    /** Hops from the nearest seed (0 = the seed itself). */
    hops: number;
    /** Relation path seed→…→entity, e.g. ['reports_to', 'works_at']. */
    path: string[];
}

export interface TraverseOptions {
    maxHops?: number;
    /** Follow edges src→dst only (default), or also dst→src (treat as undirected). */
    undirected?: boolean;
    /** Cap total entities returned (nearest-first). */
    limit?: number;
}

const DEFAULT_MAX_HOPS = 2;

/**
 * Breadth-first walk from the seed entities across the edge set. Each entity is
 * returned once, at its shortest hop distance from any seed, with the relation
 * path that reached it. Seeds themselves are included at hop 0.
 */
export function traverseGraph(
    seeds: string[],
    edges: GraphEdge[],
    options: TraverseOptions = {}
): TraversalHit[] {
    const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
    const undirected = options.undirected ?? false;

    // Adjacency: entity → outgoing (and, if undirected, incoming) edges.
    const adj = new Map<string, { to: string; relation: string }[]>();
    const add = (from: string, to: string, relation: string) => {
        const list = adj.get(from) ?? [];
        list.push({ to, relation });
        adj.set(from, list);
    };
    for (const e of edges) {
        add(e.src, e.dst, e.relation);
        if (undirected) add(e.dst, e.src, e.relation);
    }

    const seen = new Set<string>();
    const hits: TraversalHit[] = [];
    let frontier: TraversalHit[] = [];

    for (const s of seeds) {
        if (seen.has(s)) continue;
        seen.add(s);
        const hit: TraversalHit = { entityId: s, hops: 0, path: [] };
        hits.push(hit);
        frontier.push(hit);
    }

    for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
        const next: TraversalHit[] = [];
        for (const node of frontier) {
            for (const edge of adj.get(node.entityId) ?? []) {
                if (seen.has(edge.to)) continue; // shortest-path: first visit wins
                seen.add(edge.to);
                const hit: TraversalHit = { entityId: edge.to, hops: hop, path: [...node.path, edge.relation] };
                hits.push(hit);
                next.push(hit);
            }
        }
        frontier = next;
    }

    const ordered = hits.sort((a, b) => a.hops - b.hops);
    return options.limit != null ? ordered.slice(0, options.limit) : ordered;
}

/** Convenience: just the entity ids reachable within maxHops (seeds included). */
export function reachableEntityIds(seeds: string[], edges: GraphEdge[], options: TraverseOptions = {}): string[] {
    return traverseGraph(seeds, edges, options).map(h => h.entityId);
}
