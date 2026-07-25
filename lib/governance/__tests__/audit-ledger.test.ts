import { describe, it, expect } from 'vitest';
import {
    GENESIS_HASH,
    hashContent,
    verifyChainStructure,
    type LedgerRowLite,
    type CheckpointLite,
} from '../audit-ledger';

/**
 * Build a well-formed chain where each entry's `entry_hash` is deterministic and
 * `prev_hash` links to the previous entry (genesis for the first). This mirrors
 * the invariant the DB append function guarantees; we test that the independent
 * structural verifier accepts valid chains and rejects every tampering class.
 */
function buildChain(n: number): LedgerRowLite[] {
    const rows: LedgerRowLite[] = [];
    let prev = GENESIS_HASH;
    for (let seq = 1; seq <= n; seq++) {
        const entry = hashContent(`${prev}|entry-${seq}`);
        rows.push({ seq, prev_hash: prev, entry_hash: entry });
        prev = entry;
    }
    return rows;
}

describe('hashContent', () => {
    it('is deterministic sha256 hex (64 chars)', () => {
        expect(hashContent('hello')).toBe(hashContent('hello'));
        expect(hashContent('hello')).toMatch(/^[0-9a-f]{64}$/);
        expect(hashContent('a')).not.toBe(hashContent('b'));
    });
});

describe('verifyChainStructure', () => {
    it('accepts a valid chain', () => {
        const r = verifyChainStructure(buildChain(5));
        expect(r.ok).toBe(true);
        expect(r.entries).toBe(5);
        expect(r.firstBadSeq).toBeNull();
    });

    it('accepts an empty chain', () => {
        expect(verifyChainStructure([]).ok).toBe(true);
    });

    it('accepts rows given out of order (it sorts by seq)', () => {
        const chain = buildChain(4);
        const shuffled = [chain[3], chain[0], chain[2], chain[1]];
        expect(verifyChainStructure(shuffled).ok).toBe(true);
    });

    it('rejects a deleted middle entry (broken linkage)', () => {
        const chain = buildChain(5);
        const withHole = chain.filter(r => r.seq !== 3); // remove seq 3
        const r = verifyChainStructure(withHole);
        expect(r.ok).toBe(false);
        expect(r.firstBadSeq).toBe(4); // seq jumps 2 -> 4
    });

    it('rejects a truncated tail via checkpoint pinning', () => {
        const chain = buildChain(5);
        const checkpoint: CheckpointLite = { up_to_seq: 5, chain_hash: chain[4].entry_hash };
        // Attacker drops the last two entries; structure of the head is fine...
        const truncated = chain.slice(0, 3);
        const r = verifyChainStructure(truncated, [checkpoint]);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/truncation/);
    });

    it('rejects a tampered prev_hash link', () => {
        const chain = buildChain(4);
        chain[2] = { ...chain[2], prev_hash: 'deadbeef' };
        const r = verifyChainStructure(chain);
        expect(r.ok).toBe(false);
        expect(r.firstBadSeq).toBe(3);
    });

    it('rejects a reordered/renumbered entry', () => {
        const chain = buildChain(4);
        chain[1] = { ...chain[1], seq: 99 };
        const r = verifyChainStructure(chain);
        expect(r.ok).toBe(false);
    });

    it('rejects a checkpoint that pins the wrong hash', () => {
        const chain = buildChain(3);
        const badCheckpoint: CheckpointLite = { up_to_seq: 3, chain_hash: 'not-the-real-hash' };
        const r = verifyChainStructure(chain, [badCheckpoint]);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/mismatch/);
    });
});
