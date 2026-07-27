import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { createServerClient } from "@/lib/supabaseServer";
import { hasFeature, type SubscriptionTier } from "@/lib/entitlements";
import { featureGateResponse } from "@/lib/require-tier-feature";
import { getAuditActor, writeAuditLog } from "@/lib/audit-log";

type MemberRow = {
    user_id: string;
    role: string;
    joined_at: string;
};

type ProfileRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
};

function resolveMemberName(user: User | null, profile: ProfileRow | undefined): string {
    const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
    if (profileName) return profileName;

    const metadata = user?.user_metadata ?? {};
    const metadataName =
        (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
        (typeof metadata.name === "string" && metadata.name.trim()) ||
        [metadata.first_name, metadata.last_name]
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .join(" ")
            .trim();

    return metadataName || "Name not provided";
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> },
) {
    const { orgSlug } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: organization, error: organizationError } = await admin
        .from("organizations")
        .select("id, owner_id, subscription_tier")
        .eq("slug", orgSlug)
        .single();

    if (organizationError || !organization) {
        return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { data: requestingMembership } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", organization.id)
        .eq("user_id", user.id)
        .maybeSingle();

    if (organization.owner_id !== user.id && !requestingMembership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: memberRows, error: membersError } = await admin
        .from("organization_members")
        .select("user_id, role, joined_at")
        .eq("organization_id", organization.id)
        .order("joined_at", { ascending: true });

    if (membersError) {
        return NextResponse.json({ error: "Could not load organization members" }, { status: 500 });
    }

    const members = (memberRows ?? []) as MemberRow[];
    const memberIds = members.map((member) => member.user_id);
    const profilesById = new Map<string, ProfileRow>();

    if (memberIds.length > 0) {
        const { data: profiles } = await admin
            .from("user_profiles")
            .select("id, first_name, last_name, avatar_url")
            .in("id", memberIds);

        for (const profile of (profiles ?? []) as ProfileRow[]) {
            profilesById.set(profile.id, profile);
        }
    }

    const usersById = new Map<string, User>();
    const batchSize = 20;

    for (let index = 0; index < memberIds.length; index += batchSize) {
        const batch = memberIds.slice(index, index + batchSize);
        const users = await Promise.all(
            batch.map(async (userId) => {
                const { data, error } = await admin.auth.admin.getUserById(userId);
                return error ? null : data.user;
            }),
        );

        for (const authUser of users) {
            if (authUser) usersById.set(authUser.id, authUser);
        }
    }

    return NextResponse.json({
        members: members.map((member) => {
            const authUser = usersById.get(member.user_id) ?? null;
            const profile = profilesById.get(member.user_id);
            const metadata = authUser?.user_metadata ?? {};

            return {
                ...member,
                name: resolveMemberName(authUser, profile),
                email: authUser?.email ?? "Email unavailable",
                avatar_url:
                    profile?.avatar_url ||
                    (typeof metadata.avatar_url === "string" ? metadata.avatar_url : null) ||
                    (typeof metadata.picture === "string" ? metadata.picture : null),
            };
        }),
    });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> },
) {
    const { orgSlug } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: organization, error: organizationError } = await admin
        .from("organizations")
        .select("id, owner_id, subscription_tier")
        .eq("slug", orgSlug)
        .single();

    if (organizationError || !organization) {
        return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { data: requestingMembership } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", organization.id)
        .eq("user_id", user.id)
        .maybeSingle();

    const canManageMembers = organization.owner_id === user.id || requestingMembership?.role === "admin";
    if (!canManageMembers) {
        return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const tier = (organization.subscription_tier || "free") as SubscriptionTier;
    if (!hasFeature(tier, "teams")) {
        return featureGateResponse("teams");
    }

    const body = await request.json().catch(() => null) as { userId?: string; role?: string } | null;
    const userId = body?.userId?.trim();
    const role = body?.role;

    if (!userId || !role || !["member", "admin"].includes(role)) {
        return NextResponse.json({ error: "A valid member and role are required" }, { status: 400 });
    }

    if (userId === organization.owner_id) {
        return NextResponse.json({ error: "The organization owner's role cannot be changed" }, { status: 400 });
    }

    const { data: targetMembership } = await admin
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", organization.id)
        .eq("user_id", userId)
        .maybeSingle();

    if (!targetMembership) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const { error: updateError } = await admin
        .from("organization_members")
        .update({ role })
        .eq("organization_id", organization.id)
        .eq("user_id", userId);

    if (updateError) {
        return NextResponse.json({ error: "Could not update member role" }, { status: 500 });
    }

    const actorIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || request.headers.get("x-real-ip");
    writeAuditLog({
        organizationId: organization.id,
        category: "member",
        action: "role_changed",
        resourceType: "organization_member",
        resourceId: userId,
        ...getAuditActor(user, actorIp),
        description: `Changed organization member role from ${targetMembership.role} to ${role}`,
        metadata: {
            member_id: userId,
            previous_role: targetMembership.role,
            new_role: role,
        },
    });

    return NextResponse.json({ success: true });
}
