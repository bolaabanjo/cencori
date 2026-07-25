/**
 * Generate the Ed25519 keypair for signing governance checkpoints (PRD M0.3).
 *
 *   npx tsx scripts/gen-governance-signing-key.ts
 *
 * Set GOVERNANCE_SIGNING_PRIVATE_KEY (secret) in the server env; publish
 * GOVERNANCE_SIGNING_PUBLIC_KEY to auditors so they can verify independently.
 * When moving to a managed KMS, keep the public key stable and let the KMS hold
 * the private key.
 */

import crypto from 'crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

console.log('\n# ── GOVERNANCE_SIGNING_PRIVATE_KEY (secret — server env only) ──');
console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim());
console.log('\n# ── GOVERNANCE_SIGNING_PUBLIC_KEY (safe to publish to auditors) ──');
console.log(publicKey.export({ type: 'spki', format: 'pem' }).toString().trim());
console.log('\n# ── GOVERNANCE_SIGNING_KEY_ID (optional; defaults to gov-key-1) ──');
console.log('gov-key-1\n');
