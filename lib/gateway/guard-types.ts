import type { SecurityCheckResult } from '@/lib/safety/multi-layer-check';
import type { CustomRulesPipelineResult } from '@/lib/gateway/custom-rules';
import type { UnifiedMessage } from '@/lib/providers/base';

export type GatewayGuardBlock = {
    ok: false;
    status: number;
    code: string;
    message: string;
    /** User-facing assistant message (security blocks) */
    assistantMessage?: string;
    reasons?: string[];
    matched_rules?: string[];
};

export type GatewayInputPipelineSuccess = {
    ok: true;
    messages: UnifiedMessage[];
    inputText: string;
    inputSecurity: SecurityCheckResult;
    customRules: CustomRulesPipelineResult;
    tokenMap?: Map<string, string>;
    /** Policy `route` directive (PRD M1) — caller overrides the model/provider. */
    route?: { region?: string; provider?: string; model?: string };
};

export type GatewayInputPipelineResult = GatewayInputPipelineSuccess | GatewayGuardBlock;

export function toOpenAiErrorBody(block: GatewayGuardBlock) {
    return {
        error: {
            message: block.message,
            type: 'invalid_request_error',
            code: block.code,
        },
    };
}
