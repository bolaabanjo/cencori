/**
 * Mint a project-scoped Cencori API key for a deployed agent.
 *
 * The agent's container calls the gateway with this key, so its usage / logs /
 * spend bind to the project (Model B's telemetry boundary). We store only the
 * SHA-256 hash — the same scheme the dashboard's key generator and the gateway
 * validator use (`csk_<48hex>` → sha256 hex) — and return the plaintext once,
 * to inject into the machine env. It is never persisted in the clear.
 */

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabaseAdmin';

export async function mintAgentApiKey(
    projectId: string,
    agentName: string,
    createdBy: string | null,
): Promise<string> {
    const apiKey = `csk_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const prefix = 'csk_';

    const admin = createAdminClient();
    const { error } = await admin.from('api_keys').insert({
        project_id: projectId,
        name: `agent: ${agentName}`,
        key_prefix: apiKey.substring(0, prefix.length + 4) + '...',
        key_hash: keyHash,
        created_by: createdBy,
        environment: 'live',
        key_type: 'secret',
    });
    if (error) {
        throw new Error(`Failed to mint agent API key: ${error.message}`);
    }
    return apiKey;
}
