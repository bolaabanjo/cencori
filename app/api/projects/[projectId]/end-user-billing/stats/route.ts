import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { createServerClient } from "@/lib/supabaseServer";

function parsePeriodToDate(period: string): Date {
    const now = Date.now();
    switch (period) {
        case "7d":
            return new Date(now - 7 * 24 * 60 * 60 * 1000);
        case "30d":
            return new Date(now - 30 * 24 * 60 * 60 * 1000);
        case "90d":
            return new Date(now - 90 * 24 * 60 * 60 * 1000);
        default:
            return new Date(now - 30 * 24 * 60 * 60 * 1000);
    }
}

async function getProjectWithAccess(projectId: string) {
    const supabase = await createServerClient();
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return { error: "Unauthorized", status: 401 };

    const admin = createAdminClient();
    const { data: project } = await admin
        .from("projects")
        .select("id, organization_id")
        .eq("id", projectId)
        .single();

    if (!project) return { error: "Project not found", status: 404 };

    const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", project.organization_id)
        .eq("user_id", user.id)
        .single();

    if (!membership) return { error: "Insufficient permissions", status: 403 };

    return { project, user, admin };
}

// GET — aggregated end-user billing statistics for a project
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const result = await getProjectWithAccess(projectId);
    if ("error" in result) {
        return NextResponse.json(
            { error: result.error },
            { status: result.status }
        );
    }

    const { admin } = result;
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "30d";
    const startDate = parsePeriodToDate(period);
    const startISO = startDate.toISOString();

    try {
        // 1. Total end users (all time, this project) — count from end_users table for accuracy
        const { count: totalEndUsers } = await admin
            .from("end_users")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId);

        const { data: newEndUsers } = await admin
            .from("end_users")
            .select("created_at")
            .eq("project_id", projectId)
            .gte("created_at", startISO)
            .order("created_at", { ascending: true })
            .limit(50000);

        // 2. Active end users (with requests in period)
        let activeEndUsers = 0;
        const { data: distinctUsers } = await admin
            .from("ai_requests")
            .select("end_user_id")
            .eq("project_id", projectId)
            .not("end_user_id", "is", null)
            .neq("end_user_id", "")
            .gte("created_at", startISO);

        if (distinctUsers) {
            const uniqueIds = new Set(
                distinctUsers.map((r) => r.end_user_id)
            );
            activeEndUsers = uniqueIds.size;
        }

        // 3. Aggregated totals for the period
        const { data: requests } = await admin
            .from("ai_requests")
            .select(
                "total_tokens, provider_cost_usd, cencori_charge_usd, end_user_id, created_at"
            )
            .eq("project_id", projectId)
            .not("end_user_id", "is", null)
            .neq("end_user_id", "")
            .gte("created_at", startISO)
            .order("created_at", { ascending: true });

        const allRequests = requests || [];
        const totalRequests = allRequests.length;
        let totalTokens = 0;
        let providerCostUsd = 0;
        let customerRevenueUsd = 0;

        // Per-user aggregation for top users
        const userStats: Record<
            string,
            {
                requests: number;
                tokens: number;
                cost: number;
                revenue: number;
            }
        > = {};

        const periodDates: string[] = [];
        const startDay = new Date(startDate);
        startDay.setUTCHours(0, 0, 0, 0);
        const endDay = new Date();
        endDay.setUTCHours(0, 0, 0, 0);
        for (const cursor = new Date(startDay); cursor <= endDay; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
            periodDates.push(cursor.toISOString().split("T")[0]);
        }

        // Daily breakdown aggregation
        const dailyMap: Record<
            string,
            {
                requests: number;
                tokens: number;
                cost: number;
                revenue: number;
            }
        > = {};
        const dailyActiveUsers: Record<string, Set<string>> = {};
        const dailyNewCustomers: Record<string, number> = {};

        for (const date of periodDates) {
            dailyMap[date] = { requests: 0, tokens: 0, cost: 0, revenue: 0 };
            dailyActiveUsers[date] = new Set<string>();
            dailyNewCustomers[date] = 0;
        }

        for (const customer of newEndUsers || []) {
            const dateKey = new Date(customer.created_at).toISOString().split("T")[0];
            if (dateKey in dailyNewCustomers) {
                dailyNewCustomers[dateKey] += 1;
            }
        }

        for (const r of allRequests) {
            const tokens = r.total_tokens || 0;
            const cost = parseFloat(r.provider_cost_usd) || 0;
            const revenue = parseFloat(r.cencori_charge_usd) || 0;
            const userId = r.end_user_id;
            const dateKey = new Date(r.created_at).toISOString().split("T")[0];

            totalTokens += tokens;
            providerCostUsd += cost;
            customerRevenueUsd += revenue;

            // Per-user
            if (!userStats[userId]) {
                userStats[userId] = {
                    requests: 0,
                    tokens: 0,
                    cost: 0,
                    revenue: 0,
                };
            }
            userStats[userId].requests += 1;
            userStats[userId].tokens += tokens;
            userStats[userId].cost += cost;
            userStats[userId].revenue += revenue;

            // Daily
            if (!dailyMap[dateKey]) {
                dailyMap[dateKey] = {
                    requests: 0,
                    tokens: 0,
                    cost: 0,
                    revenue: 0,
                };
            }
            dailyMap[dateKey].requests += 1;
            dailyMap[dateKey].tokens += tokens;
            dailyMap[dateKey].cost += cost;
            dailyMap[dateKey].revenue += revenue;
            if (!dailyActiveUsers[dateKey]) dailyActiveUsers[dateKey] = new Set<string>();
            dailyActiveUsers[dateKey].add(userId);
        }

        const marginUsd = customerRevenueUsd - providerCostUsd;
        const marginPercentage =
            providerCostUsd > 0
                ? Math.round((marginUsd / providerCostUsd) * 10000) / 100
                : 0;

        // Top 10 users by cost
        const topUsers = Object.entries(userStats)
            .sort(([, a], [, b]) => b.cost - a.cost)
            .slice(0, 10)
            .map(([endUserId, stats]) => ({
                end_user_id: endUserId,
                requests: stats.requests,
                tokens: stats.tokens,
                provider_cost_usd: Math.round(stats.cost * 1e6) / 1e6,
                customer_revenue_usd: Math.round(stats.revenue * 1e6) / 1e6,
            }));

        // Daily breakdown with cumulative customer growth and daily activity.
        let cumulativeCustomers = Math.max(0, (totalEndUsers || 0) - (newEndUsers?.length || 0));
        const dailyBreakdown = periodDates.map((date) => {
            cumulativeCustomers += dailyNewCustomers[date] || 0;
            const stats = dailyMap[date];
            return {
                date,
                requests: stats.requests,
                tokens: stats.tokens,
                cost: Math.round(stats.cost * 1e6) / 1e6,
                revenue: Math.round(stats.revenue * 1e6) / 1e6,
                total_customers: cumulativeCustomers,
                active_customers: dailyActiveUsers[date]?.size || 0,
            };
        });

        return NextResponse.json({
            period,
            total_end_users: totalEndUsers || 0,
            active_end_users: activeEndUsers,
            total_requests: totalRequests,
            total_tokens: totalTokens,
            provider_cost_usd: Math.round(providerCostUsd * 1e6) / 1e6,
            customer_revenue_usd:
                Math.round(customerRevenueUsd * 1e6) / 1e6,
            margin_usd: Math.round(marginUsd * 1e6) / 1e6,
            margin_percentage: marginPercentage,
            top_users: topUsers,
            daily_breakdown: dailyBreakdown,
        });
    } catch (error) {
        console.error("[EndUserBilling] Stats GET error:", error);
        return NextResponse.json(
            { error: "Failed to fetch billing statistics" },
            { status: 500 }
        );
    }
}
