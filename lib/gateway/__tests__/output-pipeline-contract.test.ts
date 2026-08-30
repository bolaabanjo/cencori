/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockEnforcePolicies = vi.fn();

vi.mock('@/lib/governance/policy-enforcement', () => ({
    enforcePolicies: (...args: unknown[]) => mockEnforcePolicies(...args),
}));

import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { checkInputSecurity } from '@/lib/safety/multi-layer-check';
import {
    ALLOWED_USER_MESSAGE,
    HARMFUL_AI_RESPONSE,
    toUnifiedMessages,
} from '@/lib/gateway/__tests__/fixtures';
import { createMockSupabaseForSecurity } from '@/lib/gateway/__tests__/mock-supabase';

describe('Gateway output pipeline contract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEnforcePolicies.mockResolvedValue({
            decision: 'allow',
            fired: [],
            rationale: 'no active policies',
            redactions: [],
        });
    });

    it('allows benign assistant output', async () => {
        const supabase = createMockSupabaseForSecurity({ tier: 'pro' });
        const inputSecurity = checkInputSecurity(ALLOWED_USER_MESSAGE);

        const result = await runGatewayOutputGuard({
            supabase: supabase as never,
            projectId: 'proj-1',
            outputText: 'Rate limiting protects your API from abuse and cost spikes.',
            inputText: ALLOWED_USER_MESSAGE,
            inputSecurity,
            conversationHistory: toUnifiedMessages([{ role: 'user', content: ALLOWED_USER_MESSAGE }]),
        });

        expect(result.ok).toBe(true);
        expect(mockEnforcePolicies).not.toHaveBeenCalled();
    });

    it('does not block output based on legacy heuristics alone', async () => {
        const supabase = createMockSupabaseForSecurity({ tier: 'pro' });
        const inputSecurity = checkInputSecurity(ALLOWED_USER_MESSAGE);

        const result = await runGatewayOutputGuard({
            supabase: supabase as never,
            projectId: 'proj-out',
            organizationId: 'org-out',
            apiKeyId: 'key-1',
            environment: 'production',
            outputText: HARMFUL_AI_RESPONSE,
            inputText: ALLOWED_USER_MESSAGE,
            inputSecurity,
            conversationHistory: toUnifiedMessages([{ role: 'user', content: ALLOWED_USER_MESSAGE }]),
            endUserId: 'eu-1',
        });

        expect(result).toEqual({ ok: true });
        expect(mockEnforcePolicies).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({
                orgId: 'org-out',
                direction: 'output',
                signals: { risk_score: 1 },
            })
        );
    });

    it('still blocks output when an explicit governance policy requires it', async () => {
        const supabase = createMockSupabaseForSecurity({ tier: 'pro' });
        const inputSecurity = checkInputSecurity(ALLOWED_USER_MESSAGE);
        mockEnforcePolicies.mockResolvedValueOnce({
            decision: 'block',
            fired: [],
            rationale: 'configured output rule',
            redactions: [],
            block: {
                status: 403,
                code: 'policy_violation',
                message: 'Blocked by governance policy: configured output rule',
                reasons: ['production-output/configured-rule'],
            },
        });

        const result = await runGatewayOutputGuard({
            supabase: supabase as never,
            projectId: 'proj-policy',
            organizationId: 'org-policy',
            outputText: HARMFUL_AI_RESPONSE,
            inputText: ALLOWED_USER_MESSAGE,
            inputSecurity,
            conversationHistory: toUnifiedMessages([{ role: 'user', content: ALLOWED_USER_MESSAGE }]),
        });

        expect(result).toEqual({
            ok: false,
            status: 403,
            code: 'policy_violation',
            message: 'Blocked by governance policy: configured output rule',
            reasons: ['production-output/configured-rule'],
        });
        expect(mockEnforcePolicies).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({
                orgId: 'org-policy',
                direction: 'output',
                signals: { risk_score: 1 },
            })
        );
    });
});
