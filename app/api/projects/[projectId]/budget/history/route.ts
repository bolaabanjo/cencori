import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const supabase = createAdminClient();

    // Get budget settings
    const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .single();

    if (projectError || !projectData) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const gate = await requireTierFeatureForProject(projectId, 'costTracking');
    if (gate) return gate;

    const { data: project } = await supabase
        .from('projects')
        .select('monthly_budget, spend_cap')
        .eq('id', projectId)
        .single();

    const monthlyBudget = project?.monthly_budget ? parseFloat(project.monthly_budget) : null;
    const spendCap = project?.spend_cap ? parseFloat(project.spend_cap) : null;

    // Get daily spend for last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: requests } = await supabase
        .from('ai_requests')
        .select('cencori_charge_usd, created_at')
        .eq('project_id', projectId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: true });

    // Bucket by day
    const dailySpend = new Map<string, number>();
    for (const req of requests || []) {
        const day = req.created_at.slice(0, 10); // YYYY-MM-DD
        dailySpend.set(day, (dailySpend.get(day) || 0) + (req.cencori_charge_usd || 0));
    }

    // Build cumulative spend for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let cumulative = 0;
    const cumulativeSpend: Array<{ date: string; daily: number; cumulative: number }> = [];

    for (const [date, amount] of Array.from(dailySpend.entries()).sort()) {
        if (new Date(date) >= monthStart) {
            cumulative += amount;
        }
        cumulativeSpend.push({
            date,
            daily: Math.round(amount * 10000) / 10000,
            cumulative: Math.round(cumulative * 10000) / 10000,
        });
    }

    // Get alert history
    const { data: alerts } = await supabase
        .from('budget_alerts')
        .select('threshold_percent, current_spend, budget_amount, sent_to, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20);

    // Monthly spend by month (last 6 months)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const { data: monthlyRequests } = await supabase
        .from('ai_requests')
        .select('cencori_charge_usd, created_at')
        .eq('project_id', projectId)
        .gte('created_at', sixMonthsAgo.toISOString());

    const monthlySpend = new Map<string, number>();
    for (const req of monthlyRequests || []) {
        const month = req.created_at.slice(0, 7); // YYYY-MM
        monthlySpend.set(month, (monthlySpend.get(month) || 0) + (req.cencori_charge_usd || 0));
    }

    const monthlyTrend = Array.from(monthlySpend.entries())
        .sort()
        .map(([month, spend]) => ({
            month,
            spend: Math.round(spend * 100) / 100,
        }));

    return NextResponse.json({
        monthly_budget: monthlyBudget,
        spend_cap: spendCap,
        daily_spend: cumulativeSpend,
        monthly_trend: monthlyTrend,
        alerts: alerts || [],
    });
}
