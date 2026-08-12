/**
 * Shared Safety Utilities
 * 
 * Functions used across multiple AI gateway routes for security config.
 */

import { createAdminClient } from '@/lib/supabaseAdmin';
import { ProjectSecurityConfig } from '@/lib/safety/multi-layer-check';
import type { SubscriptionTier } from '@/lib/entitlements';
import {
    getCachedSecurityConfig,
    setCachedSecurityConfig,
} from '@/lib/config-cache';

/** Settings-row state, before the subscription-tier gate is applied. */
type CachedSecuritySettings = {
    inputThreshold: number;
    outputThreshold: number;
    jailbreakThreshold: number;
    filterJailbreaks: boolean;
    filterPII: boolean;
    filterPromptInjection: boolean;
};

/**
 * Get project security configuration from database.
 * Returns sensible defaults if no config is found.
 * Security features are disabled for free tier.
 */
export async function getProjectSecurityConfig(
    supabase: ReturnType<typeof createAdminClient>,
    projectId: string,
    tier: SubscriptionTier = 'free'
): Promise<ProjectSecurityConfig> {
    const securityEnabled = tier !== 'free';

    /**
     * The cached value is deliberately tier-independent. Tier comes from the
     * org subscription, not from the project row, so baking it into the cache
     * would leave a freshly upgraded org running with security switched off
     * until the entry expired. Cache what the settings row says, gate on tier
     * at read time.
     */
    const applyTier = (settings: CachedSecuritySettings): ProjectSecurityConfig => ({
        inputThreshold: settings.inputThreshold,
        outputThreshold: settings.outputThreshold,
        jailbreakThreshold: settings.jailbreakThreshold,
        enableOutputScanning: securityEnabled,
        enableJailbreakDetection: securityEnabled && settings.filterJailbreaks,
        enableObfuscatedPII: securityEnabled && settings.filterPII,
        enableIntentAnalysis: securityEnabled && settings.filterPromptInjection,
    });

    const cached = await getCachedSecurityConfig(projectId);
    if (cached?.data) {
        return applyTier(cached.data as CachedSecuritySettings);
    }

    try {
        const { data: settings } = await supabase
            .from('security_settings')
            .select('*')
            .eq('project_id', projectId)
            .single();

        if (!settings) {
            const defaults: CachedSecuritySettings = {
                inputThreshold: 0.5,
                outputThreshold: 0.6,
                jailbreakThreshold: 0.7,
                filterJailbreaks: true,
                filterPII: true,
                filterPromptInjection: true,
            };
            void setCachedSecurityConfig(projectId, defaults);
            return applyTier(defaults);
        }

        const safetyThreshold = settings.safety_threshold ?? 0.7;
        const inputThreshold = safetyThreshold; // Strictly follow the UI value
        const resolved: CachedSecuritySettings = {
            inputThreshold,
            outputThreshold: Math.max(0.1, inputThreshold - 0.1), // Slightly more lenient output check
            jailbreakThreshold: Math.max(0.2, inputThreshold),
            filterJailbreaks: settings.filter_jailbreaks ?? true,
            filterPII: settings.filter_pii ?? true,
            filterPromptInjection: settings.filter_prompt_injection ?? true,
        };
        void setCachedSecurityConfig(projectId, resolved);
        return applyTier(resolved);
    } catch (error) {
        console.warn('[Security] Failed to fetch security settings:', error);
        return {
            inputThreshold: 0.5,
            outputThreshold: 0.6,
            jailbreakThreshold: 0.7,
            enableOutputScanning: securityEnabled,
            enableJailbreakDetection: securityEnabled,
            enableObfuscatedPII: securityEnabled,
            enableIntentAnalysis: securityEnabled,
        };
    }
}
