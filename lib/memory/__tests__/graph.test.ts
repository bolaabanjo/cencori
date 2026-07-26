/**
 * @vitest-environment node
 *
 * Layer 5 graph traversal — multi-hop recall. Must return shortest-path hops,
 * stay cycle-safe, and respect the hop bound.
 */
import { describe, expect, it } from 'vitest';

import { traverseGraph, reachableEntityIds, type GraphEdge } from '../graph';

// sarah --reports_to--> marcus --works_at--> zap --located_in--> lagos
const CHAIN: GraphEdge[] = [
    { src: 'sarah', dst: 'marcus', relation: 'reports_to' },
    { src: 'marcus', dst: 'zap', relation: 'works_at' },
    { src: 'zap', dst: 'lagos', relation: 'located_in' },
];

describe('traverseGraph', () => {
    it('returns just the seed at hop 0 when it has no edges', () => {
        expect(traverseGraph(['x'], [], { maxHops: 3 })).toEqual([{ entityId: 'x', hops: 0, path: [] }]);
    });

    it('walks one hop with the relation path', () => {
        const hits = traverseGraph(['sarah'], CHAIN, { maxHops: 1 });
        expect(hits).toEqual([
            { entityId: 'sarah', hops: 0, path: [] },
            { entityId: 'marcus', hops: 1, path: ['reports_to'] },
        ]);
    });

    it('walks multiple hops, accumulating the path', () => {
        const hits = traverseGraph(['sarah'], CHAIN, { maxHops: 3 });
        const zap = hits.find(h => h.entityId === 'zap');
        expect(zap).toEqual({ entityId: 'zap', hops: 2, path: ['reports_to', 'works_at'] });
        expect(hits.find(h => h.entityId === 'lagos')?.hops).toBe(3);
    });

    it('respects maxHops', () => {
        const ids = reachableEntityIds(['sarah'], CHAIN, { maxHops: 2 });
        expect(ids).toEqual(['sarah', 'marcus', 'zap']);
        expect(ids).not.toContain('lagos');
    });

    it('is cycle-safe (each entity visited once, at shortest distance)', () => {
        const cyclic: GraphEdge[] = [
            { src: 'a', dst: 'b', relation: 'r' },
            { src: 'b', dst: 'c', relation: 'r' },
            { src: 'c', dst: 'a', relation: 'r' }, // back to a
        ];
        const hits = traverseGraph(['a'], cyclic, { maxHops: 10 });
        expect(hits.map(h => h.entityId).sort()).toEqual(['a', 'b', 'c']);
        expect(hits.find(h => h.entityId === 'a')?.hops).toBe(0); // not revisited at hop 3
    });

    it('follows edges backward when undirected', () => {
        // Seed from the org: who is connected? marcus works_at zap (dst).
        const directed = reachableEntityIds(['zap'], CHAIN, { maxHops: 1 });
        expect(directed).toEqual(['zap', 'lagos']); // only outgoing
        const undirected = reachableEntityIds(['zap'], CHAIN, { maxHops: 1, undirected: true }).sort();
        expect(undirected).toEqual(['lagos', 'marcus', 'zap']); // incoming marcus too
    });

    it('merges multiple seeds and dedupes, nearest-first', () => {
        const hits = traverseGraph(['sarah', 'zap'], CHAIN, { maxHops: 1 });
        // sarah(0), zap(0), marcus(1 from sarah), lagos(1 from zap); zap not re-added as marcus's child
        expect(hits.filter(h => h.hops === 0).map(h => h.entityId).sort()).toEqual(['sarah', 'zap']);
        expect(hits.every((h, i, arr) => i === 0 || arr[i - 1].hops <= h.hops)).toBe(true);
    });

    it('honors the limit (nearest-first)', () => {
        const hits = traverseGraph(['sarah'], CHAIN, { maxHops: 3, limit: 2 });
        expect(hits.map(h => h.entityId)).toEqual(['sarah', 'marcus']);
    });
});
