import { NextResponse } from 'next/server';
import { getCircuitStatus } from '@/lib/providers/circuit-breaker';
import { createServerClient } from '@/lib/supabaseServer';
import { getGoogleApiKey } from '@/lib/providers/google-env';

interface ProviderHealth {
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    latency: number | null;
    error?: string;
    circuit?: {
        state: 'closed' | 'open' | 'half-open';
        failures: number;
    };
}

const PROVIDERS = [
    {
        name: 'OpenAI',
        id: 'openai',
        url: 'https://api.openai.com/v1/models',
        envKey: 'OPENAI_API_KEY',
    },
    {
        name: 'Anthropic',
        id: 'anthropic',
        url: 'https://api.anthropic.com/v1/messages',
        envKey: 'ANTHROPIC_API_KEY',
        headers: { 'anthropic-version': '2023-06-01' },
    },
    {
        name: 'Google AI',
        id: 'google',
        url: 'https://generativelanguage.googleapis.com/v1beta/models',
        envKey: 'GEMINI_API_KEY',
        useQueryParam: true,
    },
    {
        name: 'xAI',
        id: 'xai',
        url: 'https://api.x.ai/v1/models',
        envKey: 'XAI_API_KEY',
    },
    {
        name: 'DeepSeek',
        id: 'deepseek',
        url: 'https://api.deepseek.com/v1/models',
        envKey: 'DEEPSEEK_API_KEY',
    },
    {
        name: 'Mistral',
        id: 'mistral',
        url: 'https://api.mistral.ai/v1/models',
        envKey: 'MISTRAL_API_KEY',
    },
];

async function pingProvider(provider: typeof PROVIDERS[0]): Promise<ProviderHealth> {
    const apiKey = provider.id === 'google'
        ? getGoogleApiKey()
        : process.env[provider.envKey];

    const circuitState = await getCircuitStatus(provider.id);
    const circuit = {
        state: circuitState.state,
        failures: circuitState.failures,
    };

    if (circuitState.state === 'open') {
        return {
            name: provider.name,
            status: 'down',
            latency: null,
            error: 'Circuit breaker open',
            circuit,
        };
    }

    if (!apiKey) {
        return {
            name: provider.name,
            status: 'down',
            latency: null,
            error: 'API key not configured',
            circuit,
        };
    }

    const start = Date.now();

    try {
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${apiKey}`,
            ...provider.headers,
        };

        if (provider.name === 'Anthropic') {
            headers['x-api-key'] = apiKey;
            delete headers['Authorization'];
        }

        let url = provider.url;
        if (provider.useQueryParam) {
            url = `${provider.url}?key=${apiKey}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(5000),
        });

        const latency = Date.now() - start;

        if (response.ok) {
            const status = circuitState.state === 'half-open' ? 'degraded' :
                latency > 500 ? 'degraded' : 'healthy';
            return {
                name: provider.name,
                status,
                latency,
                circuit,
            };
        }

        if (response.status === 401 || response.status === 403) {
            return {
                name: provider.name,
                status: 'down',
                latency,
                error: `Authentication failed (HTTP ${response.status})`,
                circuit,
            };
        }

        return {
            name: provider.name,
            status: 'degraded',
            latency,
            error: `HTTP ${response.status}`,
            circuit,
        };
    } catch (error) {
        const latency = Date.now() - start;
        return {
            name: provider.name,
            status: 'down',
            latency: latency > 5000 ? null : latency,
            error: error instanceof Error ? error.message : 'Unknown error',
            circuit,
        };
    }
}

export async function GET() {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await Promise.all(PROVIDERS.map(pingProvider));

    const healthy = results.filter(p => p.status === 'healthy').length;
    const degraded = results.filter(p => p.status === 'degraded').length;
    const down = results.filter(p => p.status === 'down').length;

    return NextResponse.json({
        providers: results,
        summary: {
            total: PROVIDERS.length,
            healthy,
            degraded,
            down,
        },
        checked_at: new Date().toISOString(),
    });
}
