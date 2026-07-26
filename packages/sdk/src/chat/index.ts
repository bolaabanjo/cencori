/**
 * Cencori Chat namespace — OpenAI-compatible chat completions with
 * gateway-level memory.
 *
 * The magic path: one line makes chat stateful.
 *
 * @example
 * ```typescript
 * const response = await cencori.chat.completions.create({
 *     model: 'gpt-4o',
 *     messages: [{ role: 'user', content: 'What did we agree about pricing?' }],
 *     memory: { userId: session.user.id },
 * });
 * console.log(response.choices[0].message.content);
 * console.log(response.memory?.retrieved); // facts injected into this reply
 * ```
 */

import type { CencoriConfig } from '../types';

export interface ChatMemoryOptions {
    userId?: string;
    sessionId?: string;
    scope?: 'session' | 'user';
    retrieve?: boolean;
    write?: boolean;
    topK?: number;
    threshold?: number;
    namespace?: string;
    /**
     * Temporal recall: retrieve memory as it was valid at this instant
     * (ISO 8601), including facts later superseded. Omit for current state.
     */
    asOf?: string;
    /**
     * How recalled memories are surfaced to the model:
     * - 'inject' (default): full memory contents in context.
     * - 'index': a compact table of contents (id + summary); the model fetches
     *   a full note on demand via GET /v1/memory/:id. Best for agents — avoids
     *   burying the signal under full-text every turn.
     */
    mode?: 'inject' | 'index';
    extract?: {
        model?: string;
        prompt?: string;
        minImportance?: number;
    };
}

export interface ChatCompletionMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
}

export interface ChatCompletionCreateParams {
    model: string;
    messages: ChatCompletionMessage[];
    temperature?: number;
    max_tokens?: number;
    user?: string;
    memory?: ChatMemoryOptions;
    tools?: unknown[];
    tool_choice?: unknown;
    prompt?: { name: string; variables?: Record<string, string> };
}

export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: { role: string; content: string; tool_calls?: unknown[] };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    memory?: {
        retrieved: Array<{ id: string; score: number; content: string }>;
        written: Array<{ id: string; content: string }>;
        write_status: 'pending' | 'disabled';
    };
}

export interface ChatCompletionChunk {
    delta: string;
    raw: Record<string, unknown>;
}

export interface ChatCompletionStream extends AsyncIterable<ChatCompletionChunk> {
    /** Number of memories injected into this request (from X-Cencori-Memory-Retrieved). */
    memoriesRetrieved: number;
}

class Completions {
    constructor(private config: Required<CencoriConfig>) {}

    // The OpenAI-compat chat handler. Public /v1/chat/completions rewrites
    // here too; the SDK targets the app path directly (rewrite-independent).
    private endpoint(): string {
        return `${this.config.baseUrl}/api/v1/chat/completions`;
    }

    private headers(): Record<string, string> {
        return {
            'CENCORI_API_KEY': this.config.apiKey,
            'Content-Type': 'application/json',
            ...this.config.headers,
        };
    }

    /**
     * Create a chat completion. Include `memory: { userId }` to retrieve
     * relevant facts before the model call and persist new ones after it.
     */
    async create(params: ChatCompletionCreateParams): Promise<ChatCompletionResponse> {
        const response = await fetch(this.endpoint(), {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ ...params, stream: false }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})) as {
                error?: { message?: string } | string;
                message?: string;
            };
            const message =
                typeof errorData.error === 'object'
                    ? errorData.error?.message
                    : errorData.error || errorData.message;
            throw new Error(`Cencori API error: ${message || response.statusText}`);
        }

        return response.json() as Promise<ChatCompletionResponse>;
    }

    /**
     * Stream a chat completion (SSE). Memory writeback still runs after the
     * stream completes; `memoriesRetrieved` reports the injected count.
     */
    async stream(params: ChatCompletionCreateParams): Promise<ChatCompletionStream> {
        const response = await fetch(this.endpoint(), {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ ...params, stream: true }),
        });

        if (!response.ok || !response.body) {
            const errorData = await response.json().catch(() => ({})) as { error?: unknown };
            throw new Error(`Cencori API error: ${JSON.stringify(errorData.error) || response.statusText}`);
        }

        const memoriesRetrieved = Number(response.headers.get('X-Cencori-Memory-Retrieved') || 0);
        const body = response.body;

        const iterable: ChatCompletionStream = {
            memoriesRetrieved,
            async *[Symbol.asyncIterator]() {
                const reader = body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });

                        const lines = buffer.split('\n');
                        buffer = lines.pop() ?? '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed.startsWith('data: ')) continue;
                            const payload = trimmed.slice(6);
                            if (payload === '[DONE]') return;

                            try {
                                const parsed = JSON.parse(payload) as Record<string, unknown>;
                                const delta =
                                    ((parsed.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]
                                        ?.delta?.content) ?? '';
                                yield { delta, raw: parsed };
                            } catch {
                                // Skip malformed chunks
                            }
                        }
                    }
                } finally {
                    reader.releaseLock();
                }
            },
        };

        return iterable;
    }
}

export class ChatNamespace {
    readonly completions: Completions;

    constructor(config: Required<CencoriConfig>) {
        this.completions = new Completions(config);
    }
}
