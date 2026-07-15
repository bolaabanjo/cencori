import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const LAST_ORG_COOKIE = "cencori:last-org";

/**
 * `/dashboard` entry point.
 *
 * Resolves the user to their working org and forwards them into it:
 *   1. Prefer the last-visited org (cookie), if still a member.
 *   2. Otherwise their first-owned org.
 *   3. Otherwise their first-member org.
 *   4. Otherwise onboarding.
 */
export default async function DashboardHome() {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // 1. Last-visited org — validate the user is still a member.
    const cookieStore = await cookies();
    const lastOrgSlug = cookieStore.get(LAST_ORG_COOKIE)?.value;
    if (lastOrgSlug) {
        const { data: org } = await supabase
            .from("organizations")
            .select("id, slug")
            .eq("slug", lastOrgSlug)
            .maybeSingle();
        if (org) {
            const { data: membership } = await supabase
                .from("organization_members")
                .select("role")
                .eq("organization_id", org.id)
                .eq("user_id", user.id)
                .maybeSingle();
            if (membership) redirect(`/${org.slug}`);
        }
        // Cookie stale — fall through.
    }

    // 2. First-owned org.
    const { data: ownedOrgs } = await supabase
        .from("organizations")
        .select("slug")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
    if (ownedOrgs && ownedOrgs.length > 0) redirect(`/${ownedOrgs[0].slug}`);

    // 3. First membership.
    const { data: memberOrgs } = await supabase
        .from("organization_members")
        .select("organizations!inner(slug)")
        .eq("user_id", user.id)
        .limit(1);
    const firstMemberOrg = memberOrgs?.[0]?.organizations as { slug: string } | undefined;
    if (firstMemberOrg?.slug) redirect(`/${firstMemberOrg.slug}`);

    // 4. No org yet.
    redirect("/onboarding");
}
