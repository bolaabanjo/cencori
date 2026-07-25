import type { createAdminClient } from '@/lib/supabaseAdmin';
import {
    checkOutputSecurity,
    type SecurityCheckResult,
} from '@/lib/safety/multi-layer-check';
import { triggerSecurityWebhook } from '@/lib/webhooks';
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
    const outputSecurity = checkOutputSecurity(params.outputText, {
        inputText: params.inputText,
        inputSecurityResult: params.inputSecurity,
        conversationHistory: params.conversationHistory,
    });

    if (outputSecurity.safe) {
        // Policy-as-code enforcement on the output phase (PRD M1.2).
        if (params.organizationId) {
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
        }
        return { ok: true };
    }

    const severity = 'critical';
    await params.supabase.from('security_incidents').insert({
        project_id: params.projectId,
        api_key_id: params.apiKeyId ?? null,
        environment: params.environment || 'production',
        incident_type: 'output_leakage',
        severity,
        description: `Blocked output leakage: ${outputSecurity.reasons.join(', ')}`,
        input_text: params.inputText,
        output_text: params.outputText.substring(0, 2000),
        risk_score: Math.min(Math.max(outputSecurity.riskScore, 0), 1),
        details: outputSecurity.details,
        action_taken: 'blocked',
        end_user_id: params.endUserId ?? null,
        blocked_at: 'output',
        detection_method: 'automated_check',
    });

    void triggerSecurityWebhook(params.projectId, {
        incident_type: 'output_leakage',
        severity,
        description: `Blocked output leakage: ${outputSecurity.reasons.join(', ')}`,
        end_user_id: params.endUserId || undefined,
    });

    return {
        ok: false,
        status: 403,
        code: 'output_security_violation',
        message: 'Response blocked due to security content policy',
        reasons: outputSecurity.reasons,
    };
}
