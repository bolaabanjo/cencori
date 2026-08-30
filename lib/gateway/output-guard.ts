import type { createAdminClient } from '@/lib/supabaseAdmin';
import {
    checkOutputSecurity,
    type SecurityCheckResult,
} from '@/lib/safety/multi-layer-check';
import type { UnifiedMessage } from '@/lib/providers/base';
import type { GatewayGuardBlock } from '@/lib/gateway/guard-types';
import { enforcePolicies, type PolicyRedaction } from '@/lib/governance/policy-enforcement';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type OutputGuardParams = {
    supabase: SupabaseAdmin;
    projectId: string;
    apiKeyId?: string | null;
    environment?: string;
    outputText: string;
    inputText: string;
    inputSecurity: SecurityCheckResult;
    conversationHistory: UnifiedMessage[];
    endUserId?: string | null;
    /** Set to enable policy-as-code enforcement (PRD M1.2). Omit = policy skipped. */
    organizationId?: string | null;
    model?: string | null;
    region?: string | null;
};

export type OutputGuardResult =
    | { ok: true; redactions?: PolicyRedaction[] }
    | (GatewayGuardBlock & { ok: false });

export async function runGatewayOutputGuard(
    params: OutputGuardParams
): Promise<OutputGuardResult> {
    // Without organization governance context, output is allowed. The legacy
    // scanner is intentionally not run on this path: its broad heuristics
    // caused false positives and user-visible stream failures.
    if (!params.organizationId) {
        return { ok: true };
    }

    const outputSecurity = checkOutputSecurity(params.outputText, {
        inputText: params.inputText,
        inputSecurityResult: params.inputSecurity,
        conversationHistory: params.conversationHistory,
    });

    // The legacy output scanner uses broad substring and PII heuristics. Those
    // signals are useful to an explicitly configured policy, but are not
    // reliable enough to terminate a general-purpose model stream on their own
    // (normal coding answers commonly contain words such as "vulnerability" or
    // example contact data). Only policy-as-code may hard-stop output here.
    const enforcement = await enforcePolicies(params.supabase, {
        orgId: params.organizationId,
        projectId: params.projectId,
        direction: 'output',
        model: params.model,
        environment: params.environment,
        region: params.region,
        content: params.outputText,
        signals: { risk_score: outputSecurity.riskScore },
        apiKeyId: params.apiKeyId,
    });
    if (enforcement.block) {
        return {
            ok: false,
            status: enforcement.block.status,
            code: enforcement.block.code,
            message: enforcement.block.message,
            reasons: enforcement.block.reasons,
        };
    }
    // Return redact/tokenize directives; the caller applies them to the
    // actual emitted text (the guard scans a joined string for signals).
    if (enforcement.redactions.length > 0) {
        return { ok: true, redactions: enforcement.redactions };
    }

    return { ok: true };
}
