import { fetchSignal, readHttpErrorMessage } from './http.js';

export type MetricsPeriod = '1h' | '24h' | '7d' | '30d' | 'mtd';

export interface AgentConfig {
    model: string | null;
    system_prompt: string | null;
    tools: string[];
    temperature: number | null;
}

export interface Agent {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    shadow_mode: boolean;
    created_at: string;
    updated_at?: string;
    config: AgentConfig;
}

export interface AgentListItem {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    shadow_mode: boolean;
    created_at: string;
}

export interface ModelListResponse {
    object: 'list';
    data: Array<{
        id: string;
        object: 'model';
        created: number;
        owned_by: string;
        name?: string;
        type?: string | string[];
        context_window?: number;
        description?: string;
    }>;
    providers?: Array<{
        id: string;
        name: string;
        model_count: number;
    }>;
}

export interface MetricsResponse {
    period: string;
    start_date: string;
    end_date: string;
    requests: {
        total: number;
        success: number;
        error: number;
        filtered: number;
        success_rate: number;
    };
    cost: {
        total_usd: number;
        average_per_request_usd: number;
    };
    tokens: {
        prompt: number;
        completion: number;
        total: number;
    };
    latency: {
        avg_ms: number;
        p50_ms: number | null;
        p90_ms: number | null;
        p99_ms: number | null;
    };
    providers: Record<string, { requests: number; cost_usd: number }>;
    models: Record<string, { requests: number; cost_usd: number }>;
}

export class PlatformClient {
    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string,
    ) {}

    private async request<T>(path: string, searchParams?: Record<string, string | undefined>): Promise<T> {
        const url = new URL(`/api${path}`, this.baseUrl);

        if (searchParams) {
            for (const [key, value] of Object.entries(searchParams)) {
                if (value !== undefined) {
                    url.searchParams.set(key, value);
                }
            }
        }

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
            },
            signal: fetchSignal(),
        });

        if (!response.ok) {
            const message = await readHttpErrorMessage(response);
            throw new Error(`Cencori API error: ${message}`);
        }

        return response.json() as Promise<T>;
    }

    async listModels(): Promise<ModelListResponse> {
        return this.request<ModelListResponse>('/v1/models');
    }

    async getMetrics(period: MetricsPeriod = '7d'): Promise<MetricsResponse> {
        return this.request<MetricsResponse>('/v1/metrics', { period });
    }

    async listAgents(): Promise<{ data: AgentListItem[] }> {
        return this.request<{ data: AgentListItem[] }>('/v1/agents');
    }

    async getAgent(agentId: string): Promise<Agent> {
        return this.request<Agent>(`/v1/agents/${agentId}`);
    }
}
