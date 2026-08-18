/**
 * Usage Management Utilities
 * 
 * Functions for managing monthly usage tracking and resets
 */

import { createAdminClient } from './supabaseAdmin';

/**
 * Reset monthly usage counters for all organizations
 * Should be called on the 1st of each month via cron job
 */
export async function resetMonthlyUsage(): Promise<{ success: boolean; count: number; error?: string }> {
    const supabase = createAdminClient();

    try {
        const { data, error } = await supabase
            .from('organizations')
            .update({ monthly_requests_used: 0 })
            .neq('id', '00000000-0000-0000-0000-000000000000') // Reset all orgs
            .select('id');

        if (error) {
            console.error('[Usage Reset] Failed:', error);
            return { success: false, count: 0, error: error.message };
        }

        const count = data?.length || 0;
        console.log(`[Usage Reset] ✓ Reset ${count} organization usage counters`);

        return { success: true, count };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Usage Reset] Unexpected error:', error);
        return { success: false, count: 0, error: message };
    }
}

// checkUsageAlerts() lived here: it warned at 80% and 100% of the per-tier
// monthly request ceiling. The ceiling is gone on every tier, so a percentage
// of it has nothing to measure against. Spend is what's worth alerting on now,
// and budget alerts already own that.
//
// resetMonthlyUsage above is still wanted — monthly_requests_used remains a
// reporting counter, it just no longer gates anything.
