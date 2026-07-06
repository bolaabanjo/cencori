import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

const COUNTRY_NAMES: Record<string, string> = {
    XX: 'Unknown',
    US: 'United States', NG: 'Nigeria', GB: 'United Kingdom', DE: 'Germany',
    FR: 'France', CA: 'Canada', AU: 'Australia', IN: 'India', BR: 'Brazil',
    JP: 'Japan', KR: 'South Korea', SG: 'Singapore', NL: 'Netherlands',
    SE: 'Sweden', CH: 'Switzerland', ES: 'Spain', IT: 'Italy', MX: 'Mexico',
    AR: 'Argentina', ZA: 'South Africa', AE: 'United Arab Emirates', IL: 'Israel',
    PL: 'Poland', RU: 'Russia', CN: 'China', HK: 'Hong Kong', TW: 'Taiwan',
    TH: 'Thailand', MY: 'Malaysia', ID: 'Indonesia', PH: 'Philippines', VN: 'Vietnam',
    PK: 'Pakistan', BD: 'Bangladesh', EG: 'Egypt', KE: 'Kenya', GH: 'Ghana',
    CO: 'Colombia', CL: 'Chile', PE: 'Peru', AT: 'Austria', BE: 'Belgium',
    DK: 'Denmark', FI: 'Finland', NO: 'Norway', IE: 'Ireland', NZ: 'New Zealand',
    PT: 'Portugal', CZ: 'Czech Republic', RO: 'Romania', HU: 'Hungary', UA: 'Ukraine',
};

interface CountryStats {
    code: string;
    name: string;
    requests: number;
    tokens: number;
    cost: number;
    avgLatency: number;
    providers: Record<string, number>;
}

interface DailyStats {
    date: string;
    countries: Record<string, number>;
}

interface ProviderDailyStats {
    date: string;
    providers: Record<string, number>;
}

interface AggregatedData {
    countries: Record<string, {
        requests: number;
        tokens: number;
        cost: number;
        totalLatency: number;
        providers: Record<string, number>;
    }>;
    timeline: Record<string, Record<string, number>>;
    providerTimeline: Record<string, Record<string, number>>;
}
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const supabase = createAdminClient();

        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'analyticsDashboard');
        if (gate) return gate;

        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || '7d';
        const environment = searchParams.get('environment') || 'production';

        const rangeMap: Record<string, number> = {
            '24h': 1,
            '7d': 7,
            '30d': 30,
            '90d': 90,
        };
        const days = rangeMap[range] || 7;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await supabase
            .from('ai_requests')
            .select('country_code, total_tokens, cost_usd, latency_ms, model, created_at')
            .eq('project_id', projectId)
            .eq('environment', environment)
            .gte('created_at', startDate.toISOString());

        if (error) {
            console.error('Error fetching geo data:', error);
            return NextResponse.json({ error: 'Failed to fetch geo data' }, { status: 500 });
        }

        const aggregated: AggregatedData = {
            countries: {},
            timeline: {},
            providerTimeline: {},
        };

        for (const row of data || []) {
            const code = row.country_code || 'XX';
            const provider = detectProvider(row.model || '');

            if (!aggregated.countries[code]) {
                aggregated.countries[code] = {
                    requests: 0,
                    tokens: 0,
                    cost: 0,
                    totalLatency: 0,
                    providers: {},
                };
            }

            const country = aggregated.countries[code];
            country.requests += 1;
            country.tokens += row.total_tokens || 0;
            country.cost += parseFloat(row.cost_usd) || 0;
            country.totalLatency += row.latency_ms || 0;
            country.providers[provider] = (country.providers[provider] || 0) + 1;

            const date = new Date(row.created_at).toISOString().split('T')[0];
            if (!aggregated.timeline[date]) {
                aggregated.timeline[date] = {};
            }
            aggregated.timeline[date][code] = (aggregated.timeline[date][code] || 0) + 1;

            if (!aggregated.providerTimeline[date]) {
                aggregated.providerTimeline[date] = {};
            }
            aggregated.providerTimeline[date][provider] = (aggregated.providerTimeline[date][provider] || 0) + 1;
        }

        const countries: CountryStats[] = Object.entries(aggregated.countries)
            .map(([code, stats]) => ({
                code,
                name: COUNTRY_NAMES[code] || code,
                requests: stats.requests,
                tokens: stats.tokens,
                cost: Math.round(stats.cost * 100) / 100,
                avgLatency: stats.requests > 0 ? Math.round(stats.totalLatency / stats.requests) : 0,
                providers: stats.providers,
            }))
            .sort((a, b) => b.requests - a.requests);

        const timeline: DailyStats[] = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            timeline.push({
                date: dateStr,
                countries: aggregated.timeline[dateStr] || {},
            });
        }

        const totals = {
            requests: countries.reduce((sum, c) => sum + c.requests, 0),
            tokens: countries.reduce((sum, c) => sum + c.tokens, 0),
            cost: Math.round(countries.reduce((sum, c) => sum + c.cost, 0) * 100) / 100,
            avgLatency: countries.length > 0
                ? Math.round(countries.reduce((sum, c) => sum + c.avgLatency, 0) / countries.length)
                : 0,
        };

        const providerTotals: Record<string, number> = {};
        for (const country of countries) {
            for (const [provider, count] of Object.entries(country.providers)) {
                providerTotals[provider] = (providerTotals[provider] || 0) + count;
            }
        }

        const providerTimeline: ProviderDailyStats[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            providerTimeline.push({
                date: dateStr,
                providers: aggregated.providerTimeline[dateStr] || {},
            });
        }

        return NextResponse.json({
            countries,
            timeline,
            providerTimeline,
            totals,
            providerTotals,
        });
    } catch (error) {
        console.error('Geo analytics error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function detectProvider(model: string): string {
    const lowerModel = model.toLowerCase();
    if (lowerModel.includes('gpt') || lowerModel.includes('o1')) return 'OpenAI';
    if (lowerModel.includes('claude')) return 'Anthropic';
    if (lowerModel.includes('gemini')) return 'Google';
    if (lowerModel.includes('mistral') || lowerModel.includes('mixtral')) return 'Mistral';
    if (lowerModel.includes('llama')) return 'Meta';
    if (lowerModel.includes('grok')) return 'xAI';
    if (lowerModel.includes('qwen')) return 'Qwen';
    if (lowerModel.includes('deepseek')) return 'DeepSeek';
    if (lowerModel.includes('command')) return 'Cohere';
    return 'Other';
}
