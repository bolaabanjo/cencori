/**
 * Recipient lookup for launch / test emails.
 *
 * Given an email address, find the matching Supabase auth user and return
 * their first + full name. Falls back to the email prefix if there's no
 * match or no name in the user metadata.
 *
 * Used by the send-vision-test / send-documents-test / (future launch)
 * scripts so every launch email addresses the recipient by their real name.
 */

import { createAdminClient } from '@/lib/supabaseAdmin';

export interface RecipientName {
    firstName: string;
    fullName: string;
    /** True when the name came from user metadata; false = fell back to email prefix. */
    resolved: boolean;
}

function titleCase(word: string): string {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function fallbackFromEmail(email: string): RecipientName {
    const prefix = email.split('@')[0] ?? '';
    // Common patterns: bola.banjo, bola_banjo, bolaBanjo, bolabanjo
    const first = prefix.split(/[._-]/)[0] ?? prefix;
    return {
        firstName: titleCase(first),
        fullName: titleCase(first),
        resolved: false,
    };
}

/**
 * Look up the recipient's name from Supabase auth users.
 *
 * The Supabase auth admin API doesn't expose a direct "find by email"
 * endpoint, so this pages through users. Fine for one-off launch scripts;
 * not appropriate for hot paths.
 */
export async function lookupRecipientName(email: string): Promise<RecipientName> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) return fallbackFromEmail(email);

    try {
        const admin = createAdminClient();
        const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const found = data?.users?.find(u => u.email?.toLowerCase() === normalized);
        if (!found) return fallbackFromEmail(email);

        const metadata = (found.user_metadata ?? {}) as Record<string, unknown>;
        const rawFullName =
            (metadata.full_name as string | undefined) ??
            (metadata.name as string | undefined) ??
            '';
        const cleanedFullName = rawFullName.trim();
        if (!cleanedFullName) return fallbackFromEmail(email);

        const firstName = cleanedFullName.split(/\s+/)[0] ?? cleanedFullName;
        return { firstName, fullName: cleanedFullName, resolved: true };
    } catch (err) {
        console.warn('[recipient] lookup failed, falling back to email prefix:', err instanceof Error ? err.message : err);
        return fallbackFromEmail(email);
    }
}
