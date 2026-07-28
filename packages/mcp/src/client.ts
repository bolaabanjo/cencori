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

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
    searchParams?: Record<string, string | undefined>;
    body?: unknown;
}

export class PlatformClient {
    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string,
    ) {}

    /**
     * Low-level request against the Cencori API. Sends `Authorization: Bearer`,
     * which the gateway accepts for both `/v1/*` and `/api/ai/*` routes.
     */
    async request<T = unknown>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
        const url = new URL(`/api${path}`, this.baseUrl);

        if (options.searchParams) {
            for (const [key, value] of Object.entries(options.searchParams)) {
                if (value !== undefined) {
                    url.searchParams.set(key, value);
                }
            }
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.apiKey}`,
        };
        const init: RequestInit = { method, headers, signal: fetchSignal() };

        if (options.body !== undefined) {
            headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, init);

        if (!response.ok) {
            const message = await readHttpErrorMessage(response);
            throw new Error(`Cencori API error: ${message}`);
        }

        // Some routes (e.g. DELETE) may return an empty body.
        const text = await response.text();
        if (!text) {
            return undefined as T;
        }
        return JSON.parse(text) as T;
    }

    get<T = unknown>(path: string, searchParams?: Record<string, string | undefined>): Promise<T> {
        return this.request<T>('GET', path, { searchParams });
    }

    post<T = unknown>(path: string, body?: unknown, searchParams?: Record<string, string | undefined>): Promise<T> {
        return this.request<T>('POST', path, { body, searchParams });
    }

    patch<T = unknown>(path: string, body?: unknown): Promise<T> {
        return this.request<T>('PATCH', path, { body });
    }

    del<T = unknown>(path: string): Promise<T> {
        return this.request<T>('DELETE', path);
    }

    /** POST JSON and read a BINARY response (e.g. TTS audio). Returns base64 + mime. */
    async postBinary(path: string, body: unknown): Promise<{ base64: string; mimeType: string }> {
        const url = new URL(`/api${path}`, this.baseUrl);
        const response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: fetchSignal(),
        });
        if (!response.ok) {
            throw new Error(`Cencori API error: ${await readHttpErrorMessage(response)}`);
        }
        const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
        const buf = Buffer.from(await response.arrayBuffer());
        return { base64: buf.toString('base64'), mimeType };
    }

    /** POST multipart/form-data (e.g. STT audio upload). Let fetch set the boundary. */
    async postForm<T = unknown>(path: string, form: FormData): Promise<T> {
        const url = new URL(`/api${path}`, this.baseUrl);
        const response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.apiKey}` },
            body: form,
            signal: fetchSignal(),
        });
        if (!response.ok) {
            throw new Error(`Cencori API error: ${await readHttpErrorMessage(response)}`);
        }
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
    }

    listModels(): Promise<ModelListResponse> {
        return this.get<ModelListResponse>('/v1/models');
    }

    getMetrics(period: MetricsPeriod = '7d'): Promise<MetricsResponse> {
        return this.get<MetricsResponse>('/v1/metrics', { period });
    }

    listAgents(): Promise<{ data: AgentListItem[] }> {
        return this.get<{ data: AgentListItem[] }>('/v1/agents');
    }

    getAgent(agentId: string): Promise<Agent> {
        return this.get<Agent>(`/v1/agents/${agentId}`);
    }
}
