import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import {
    checkpointPreimage,
    signCheckpoint,
    verifyCheckpointSignature,
    verifyCheckpointSignatures,
    createSignedGovernanceCheckpoint,
    type CheckpointTail,
} from '../checkpoint';

const kp = crypto.generateKeyPairSync('ed25519');
const PRIV = kp.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUB = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const OTHER_PUB = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();

const tail: CheckpointTail = { orgId: 'o1', upToSeq: 3, chainHash: 'abc123', entryCount: 3 };

afterEach(() => vi.unstubAllEnvs());

describe('checkpointPreimage', () => {
    it('is deterministic and field-separated', () => {
        expect(checkpointPreimage(tail)).toBe(checkpointPreimage(tail));
        expect(checkpointPreimage(tail)).toBe(['o1', 3, 'abc123', 3].join('\x1e'));
    });
});

describe('sign / verify roundtrip', () => {
    it('verifies a genuine signature', () => {
        const sig = signCheckpoint(checkpointPreimage(tail), PRIV);
        expect(verifyCheckpointSignature(checkpointPreimage(tail), sig, PUB)).toBe(true);
    });

    it('rejects a tampered preimage (chain rewrite)', () => {
        const sig = signCheckpoint(checkpointPreimage(tail), PRIV);
        const tampered = checkpointPreimage({ ...tail, chainHash: 'DIFFERENT' });
        expect(verifyCheckpointSignature(tampered, sig, PUB)).toBe(false);
    });

    it('rejects verification under the wrong public key', () => {
        const sig = signCheckpoint(checkpointPreimage(tail), PRIV);
        expect(verifyCheckpointSignature(checkpointPreimage(tail), sig, OTHER_PUB)).toBe(false);
    });

    it('returns false (never throws) on malformed input', () => {
        expect(verifyCheckpointSignature('x', 'not-base64!!', PUB)).toBe(false);
        expect(verifyCheckpointSignature('x', 'AAAA', 'not-a-key')).toBe(false);
    });
});

function mockCheckpointsSupabase(rows: Array<{ up_to_seq: number; chain_hash: string; entry_count: number; signature: string | null }>) {
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    return { from: vi.fn().mockReturnValue({ select }) } as never;
}

describe('verifyCheckpointSignatures', () => {
    it('passes when all signed checkpoints verify', async () => {
        const rows = [1, 2].map(seq => {
            const t = { orgId: 'o1', upToSeq: seq, chainHash: `h${seq}`, entryCount: seq };
            return { up_to_seq: seq, chain_hash: `h${seq}`, entry_count: seq, signature: signCheckpoint(checkpointPreimage(t), PRIV) };
        });
        const res = await verifyCheckpointSignatures(mockCheckpointsSupabase(rows), 'o1', PUB);
        expect(res).toEqual({ ok: true, total: 2, signed: 2, failures: [] });
    });

    it('flags a checkpoint whose signature was forged/tampered', async () => {
        const good = { orgId: 'o1', upToSeq: 1, chainHash: 'h1', entryCount: 1 };
        const rows = [
            { up_to_seq: 1, chain_hash: 'h1', entry_count: 1, signature: signCheckpoint(checkpointPreimage(good), PRIV) },
            { up_to_seq: 2, chain_hash: 'h2', entry_count: 2, signature: 'AAAAAAAAAAAA' }, // bogus
        ];
        const res = await verifyCheckpointSignatures(mockCheckpointsSupabase(rows), 'o1', PUB);
        expect(res.ok).toBe(false);
        expect(res.failures).toEqual([{ upToSeq: 2, reason: expect.stringContaining('signature invalid') }]);
    });

    it('skips (does not fail) unsigned checkpoints', async () => {
        const rows = [{ up_to_seq: 1, chain_hash: 'h1', entry_count: 1, signature: null }];
        const res = await verifyCheckpointSignatures(mockCheckpointsSupabase(rows), 'o1', PUB);
        expect(res).toEqual({ ok: true, total: 1, signed: 0, failures: [] });
    });
});

describe('createSignedGovernanceCheckpoint', () => {
    it('reads the tail, signs it, and persists a signed checkpoint', async () => {
        vi.stubEnv('GOVERNANCE_SIGNING_PRIVATE_KEY', PRIV);
        const rpc = vi.fn((fn: string) => {
            if (fn === 'governance_checkpoint_tail') {
                return Promise.resolve({ data: [{ up_to_seq: 5, chain_hash: 'tailhash', entry_count: 5 }], error: null });
            }
            return Promise.resolve({ data: [{ id: 'cp1', signed: true }], error: null });
        });
        const res = await createSignedGovernanceCheckpoint({ rpc } as never, 'o1');
        expect(res).toMatchObject({ upToSeq: 5, chainHash: 'tailhash', entryCount: 5, signed: true });

        const insertCall = rpc.mock.calls.find(c => c[0] === 'insert_signed_governance_checkpoint');
        expect(insertCall).toBeTruthy();
        const args = insertCall![1] as { p_signature: string; p_algorithm: string };
        expect(args.p_algorithm).toBe('ed25519');
        // the persisted signature verifies against the public key
        const preimage = checkpointPreimage({ orgId: 'o1', upToSeq: 5, chainHash: 'tailhash', entryCount: 5 });
        expect(verifyCheckpointSignature(preimage, args.p_signature, PUB)).toBe(true);
    });

    it('returns null when the org has no ledger entries', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
        expect(await createSignedGovernanceCheckpoint({ rpc } as never, 'o1')).toBeNull();
    });
});
