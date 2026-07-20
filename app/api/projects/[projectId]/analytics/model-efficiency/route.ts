import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

function mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId } = await params;

    try {
        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'advancedAnalytics');
        if (gate) return gate;

        const searchParams = req.nextUrl.searchParams;
        const environment = searchParams.get('environment') || 'production';
        const timeRangeParam = searchParams.get('time_range') || '30d';
        const minRequests = Math.max(1, parseInt(searchParams.get('min_requests') || '1', 10));

        const now = new Date();
        const days = timeRangeParam === '90d' ? 90 : timeRangeParam === '7d' ? 7 : 30;
        const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        // Resolve API keys
        const { data: allApiKeys } = await supabaseAdmin
            .from('api_keys')
            .select('id, key_prefix, environment')
            .eq('project_id', projectId)
            .is('revoked_at', null);

        const apiKeys = (allApiKeys || []).filter(key => {
            if (key.environment) {
                return environment === 'production'
                    ? key.environment === 'production'
                    : key.environment === 'test';
            }
            const isTest = key.key_prefix?.includes('_test') || key.key_prefix?.includes('test_');
            return environment === 'production' ? !isTest : isTest;
        });

        const apiKeyIds = apiKeys.map(k => k.id);

        if (apiKeyIds.length === 0) {
            return NextResponse.json({ models: [], summary: null, insufficient_data: true });
        }

        // Fetch requests with only the columns we need
        const { data: requests, error } = await supabaseAdmin
            .from('ai_requests')
            .select('model, provider, cost_usd, latency_ms, status, prompt_tokens, completion_tokens, total_tokens')
            .eq('project_id', projectId)
            .in('api_key_id', apiKeyIds)
            .gte('created_at', startTime.toISOString());

        if (error) {
            console.error('[Model Efficiency API] DB error:', error);
            return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
        }

        if (!requests || requests.length === 0) {
            return NextResponse.json({ models: [], summary: null, insufficient_data: true });
        }

        // Group by model+provider
        type Group = {
            model: string;
            provider: string;
            costs: number[];
            latencies: number[];
            statuses: string[];
            promptTokens: number[];
            completionTokens: number[];
            totalTokens: number[];
        };

        const groups = new Map<string, Group>();

        for (const r of requests) {
            if (!r.model) continue;
            const key = `${r.model}||${r.provider || 'unknown'}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    model: r.model,
                    provider: r.provider || 'unknown',
                    costs: [], latencies: [], statuses: [],
                    promptTokens: [], completionTokens: [], totalTokens: [],
                });
            }
            const g = groups.get(key)!;
            if (r.cost_usd != null) g.costs.push(r.cost_usd);
            if (r.latency_ms != null) g.latencies.push(r.latency_ms);
            g.statuses.push(r.status || 'unknown');
            if (r.prompt_tokens != null) g.promptTokens.push(r.prompt_tokens);
            if (r.completion_tokens != null) g.completionTokens.push(r.completion_tokens);
            if (r.total_tokens != null) g.totalTokens.push(r.total_tokens);
        }

        // Compute per-model stats
        type ModelStat = {
            model: string;
            provider: string;
            request_count: number;
            total_cost_usd: number;
            avg_cost_per_token: number;
            avg_latency_ms: number;
            p95_latency_ms: number;
            success_rate: number;
            avg_completion_ratio: number;
            total_tokens: number;
            cost_score: number;
            speed_score: number;
            quality_score: number;
            efficiency_score: number;
            efficiency_rank: number;
            recommendation: string;
            potential_savings_usd: number | null;
        };

        const modelStats: ModelStat[] = [];

        for (const g of groups.values()) {
            const requestCount = g.statuses.length;
            if (requestCount < minRequests) continue;

            const totalCost = g.costs.reduce((a, b) => a + b, 0);
            const totalTokensSum = g.totalTokens.reduce((a, b) => a + b, 0);
            const avgCostPerToken = totalTokensSum > 0 ? totalCost / totalTokensSum : 0;
            const avgLatency = mean(g.latencies);
            const p95Latency = percentile(g.latencies, 95);
            const successCount = g.statuses.filter(s => s === 'success' || s === 'success_fallback').length;
            const successRate = requestCount > 0 ? successCount / requestCount : 0;
            const totalCompletions = g.completionTokens.reduce((a, b) => a + b, 0);
            const totalPrompts = g.promptTokens.reduce((a, b) => a + b, 0);
            const avgCompletionRatio = totalPrompts > 0 ? totalCompletions / totalPrompts : 0;

            modelStats.push({
                model: g.model,
                provider: g.provider,
                request_count: requestCount,
                total_cost_usd: totalCost,
                avg_cost_per_token: avgCostPerToken,
                avg_latency_ms: Math.round(avgLatency),
                p95_latency_ms: Math.round(p95Latency),
                success_rate: Math.round(successRate * 1000) / 1000,
                avg_completion_ratio: Math.round(avgCompletionRatio * 100) / 100,
                total_tokens: totalTokensSum,
                cost_score: 0,
                speed_score: 0,
                quality_score: 0,
                efficiency_score: 0,
                efficiency_rank: 0,
                recommendation: '',
                potential_savings_usd: null,
            });
        }

        if (modelStats.length === 0) {
            return NextResponse.json({
                models: [],
                summary: null,
                insufficient_data: true,
                total_requests_analyzed: requests.length,
            });
        }

        // Absolute anchors — scores reflect real-world performance, not just relative ranking.
        // This prevents "only 2 models" from collapsing to full vs empty bars.
        const COST_CEILING = 0.00003;   // $0.03/1K tokens (GPT-4o tier) → score 0.0
        const LATENCY_CEILING = 10000;  // 10,000ms → score 0.0

        for (const m of modelStats) {
            // Cost: cheaper = higher score. $0 → 1.0, $0.00003/tok → 0.0
            m.cost_score = Math.max(0, 1 - m.avg_cost_per_token / COST_CEILING);

            // Speed: faster = higher score. 0ms → 1.0, 10,000ms → 0.0
            m.speed_score = Math.max(0, 1 - m.avg_latency_ms / LATENCY_CEILING);

            // Delivery: success rate is already 0–1, use it directly (no normalization)
            m.quality_score = m.success_rate;

            m.efficiency_score =
                m.cost_score * 0.45 +
                m.speed_score * 0.30 +
                m.quality_score * 0.25;
        }

        // Rank by efficiency score (descending)
        modelStats.sort((a, b) => b.efficiency_score - a.efficiency_score);
        modelStats.forEach((m, i) => { m.efficiency_rank = i + 1; });

        // Derive recommendations
        const byCost = [...modelStats].sort((a, b) => b.cost_score - a.cost_score);
        const bySpeed = [...modelStats].sort((a, b) => b.speed_score - a.speed_score);
        const byQuality = [...modelStats].sort((a, b) => b.quality_score - a.quality_score);

        for (const m of modelStats) {
            if (m.efficiency_rank === 1) {
                m.recommendation = 'Best overall';
            } else if (modelStats.length > 1 && m.model === byCost[0].model && m.provider === byCost[0].provider) {
                m.recommendation = 'Cheapest per token';
            } else if (modelStats.length > 1 && m.model === bySpeed[0].model && m.provider === bySpeed[0].provider) {
                m.recommendation = 'Fastest response';
            } else if (modelStats.length > 1 && m.model === byQuality[0].model && m.provider === byQuality[0].provider) {
                m.recommendation = 'Highest delivery rate';
            }
        }

        // Potential savings vs top-ranked model
        const topModel = modelStats[0];
        let totalPotentialSavings = 0;

        for (const m of modelStats) {
            if (m.efficiency_rank === 1) {
                m.potential_savings_usd = 0;
                continue;
            }
            if (topModel.avg_cost_per_token >= 0 && m.avg_cost_per_token > topModel.avg_cost_per_token) {
                const savings = (m.avg_cost_per_token - topModel.avg_cost_per_token) * m.total_tokens;
                m.potential_savings_usd = Math.max(0, Math.round(savings * 10000) / 10000);
                totalPotentialSavings += m.potential_savings_usd;
            } else {
                m.potential_savings_usd = 0;
            }
        }

        const summary = {
            top_model: topModel.model,
            top_provider: topModel.provider,
            cheapest_model: byCost[0].model,
            fastest_model: bySpeed[0].model,
            total_cost_analyzed: Math.round(modelStats.reduce((s, m) => s + m.total_cost_usd, 0) * 10000) / 10000,
            potential_savings_usd: Math.round(totalPotentialSavings * 10000) / 10000,
            analysis_period_days: days,
            total_requests_analyzed: modelStats.reduce((s, m) => s + m.request_count, 0),
        };

        return NextResponse.json({
            models: modelStats,
            summary,
            insufficient_data: false,
        });

    } catch (error) {
        console.error('[Model Efficiency API] Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
