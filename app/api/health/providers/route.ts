import { NextResponse } from 'next/server';
import { getAllCircuitStates } from '@/lib/providers/circuit-breaker';
import { createServerClient } from '@/lib/supabaseServer';

const KNOWN_PROVIDERS = [
    'openai',
    'anthropic',
    'google',
    'mistral',
    'xai',
    'deepseek',
    'cohere',
    'groq',
    'perplexity',
];

export async function GET() {
    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const allStates = await getAllCircuitStates();

        const providerStatuses = KNOWN_PROVIDERS.map((provider) => {
            const state = allStates[provider] || {
                failures: 0,
                lastFailure: 0,
                state: 'closed' as const,
                lastSuccess: Date.now(),
            };
            return {
                provider,
                state: state.state,
                failures: state.failures,
                lastFailure: state.lastFailure,
                lastSuccess: state.lastSuccess,
            };
        });

        const openCircuits = providerStatuses.filter(p => p.state === 'open').length;
        const halfOpenCircuits = providerStatuses.filter(p => p.state === 'half-open').length;
        const healthyCircuits = providerStatuses.filter(p => p.state === 'closed').length;

        return NextResponse.json({
            providers: providerStatuses,
            summary: {
                total: KNOWN_PROVIDERS.length,
                healthy: healthyCircuits,
                degraded: halfOpenCircuits,
                down: openCircuits,
            },
        });
    } catch (error) {
        console.error('[API] Error fetching circuit states:', error);
        return NextResponse.json(
            { error: 'Failed to fetch circuit states' },
            { status: 500 }
        );
    }
}
