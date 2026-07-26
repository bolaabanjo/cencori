/**
 * Chat
 *
 * Drop-in chat UI wired to the Cencori gateway. Pass `memory={{ userId }}`
 * and the conversation becomes stateful across sessions — the gateway
 * retrieves what it knows about the user before each reply and persists new
 * facts after. This is the two-line integration from the memory roadmap:
 *
 *   <Chat
 *       model="gpt-4o"
 *       apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY!}
 *       memory={{ userId: session.user.id }}
 *   />
 *
 * Streams by default (SSE). Zero external state — safe to embed in a
 * customer's own product.
 *
 * Deps: react, lucide-react, tailwindcss.
 */

'use client';

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type ReactNode,
} from 'react';
import { Brain, Loader2, Send } from 'lucide-react';

// ── Public types ────────────────────────────────────────────────

/** Mirrors `ChatMemoryOptions` from the core SDK. */
export interface ChatMemoryProp {
    userId?: string;
    sessionId?: string;
    scope?: 'session' | 'user';
    retrieve?: boolean;
    write?: boolean;
    topK?: number;
    threshold?: number;
    namespace?: string;
    /** Temporal recall: memory as it was valid at this instant (ISO 8601). */
    asOf?: string;
    /** 'inject' (default) full contents, or 'index' compact table-of-contents. */
    mode?: 'inject' | 'index';
    extract?: {
        model?: string;
        prompt?: string;
        minImportance?: number;
    };
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatProps {
    /** Model to route to (e.g. "gpt-4o", "claude-sonnet-4-5"). */
    model: string;
    /** Cencori API key. Sent as `CENCORI_API_KEY`. Use a publishable/test key on the client. */
    apiKey?: string;
    /**
     * Turn on gateway memory. `{ userId }` is enough — retrieval + writeback
     * default to on. Omit to run a stateless chat.
     */
    memory?: ChatMemoryProp;
    /** System prompt prepended to every request. */
    system?: string;
    /** Seed the transcript (not sent as system — shown as prior turns). */
    initialMessages?: ChatMessage[];
    /** Sampling temperature. */
    temperature?: number;
    /** Max tokens for each reply. */
    maxTokens?: number;
    /** Stream tokens as they arrive. Default: true. */
    stream?: boolean;
    /**
     * Base URL of the Cencori gateway. Defaults to `https://cencori.com`.
     * Override to point at a self-hosted gateway or a same-origin proxy.
     */
    baseUrl?: string;
    /** Placeholder for the input. */
    placeholder?: string;
    /** Called after each reply with how many memories the gateway injected. */
    onMemoryRetrieved?: (count: number) => void;
    /** Called on any request error (before the inline banner renders it). */
    onError?: (error: Error) => void;
    /** Custom empty-state node shown before the first message. */
    emptyState?: ReactNode;
    /** Extra classes on the root element. */
    className?: string;
    /** Hide the "recalled N memories" indicator. Default: shown when memory is on. */
    hideMemoryIndicator?: boolean;
}

// ── Component ───────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://cencori.com';

export function Chat({
    model,
    apiKey,
    memory,
    system,
    initialMessages,
    temperature,
    maxTokens,
    stream = true,
    baseUrl = DEFAULT_BASE_URL,
    placeholder = 'Send a message…',
    onMemoryRetrieved,
    onError,
    emptyState,
    className,
    hideMemoryIndicator = false,
}: ChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recalled, setRecalled] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const endpoint = useMemo(
        () => `${baseUrl.replace(/\/$/, '')}/api/v1/chat/completions`,
        [baseUrl]
    );

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, busy]);

    const send = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || busy) return;

            setError(null);
            setBusy(true);

            const userMsg: ChatMessage = { role: 'user', content: trimmed };
            const history = [...messages, userMsg];
            setMessages(history);
            setInput('');

            const outbound: ChatMessage[] = system
                ? [{ role: 'system', content: system }, ...history]
                : history;

            const body = {
                model,
                messages: outbound,
                memory,
                temperature,
                max_tokens: maxTokens,
                stream,
            };

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiKey) headers['CENCORI_API_KEY'] = apiKey;

            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                });

                if (!res.ok || (stream && !res.body)) {
                    const data = (await res.json().catch(() => ({}))) as {
                        error?: { message?: string } | string;
                    };
                    const msg =
                        typeof data.error === 'object' ? data.error?.message : data.error;
                    throw new Error(msg || `Cencori API error (${res.status})`);
                }

                if (memory && !hideMemoryIndicator) {
                    const count = Number(res.headers.get('X-Cencori-Memory-Retrieved') || 0);
                    setRecalled(count);
                    onMemoryRetrieved?.(count);
                }

                if (stream && res.body) {
                    // Placeholder assistant message we append tokens into.
                    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() ?? '';

                        for (const line of lines) {
                            const t = line.trim();
                            if (!t.startsWith('data: ')) continue;
                            const payload = t.slice(6);
                            if (payload === '[DONE]') break;
                            try {
                                const parsed = JSON.parse(payload) as {
                                    choices?: Array<{ delta?: { content?: string } }>;
                                };
                                const delta = parsed.choices?.[0]?.delta?.content ?? '';
                                if (!delta) continue;
                                setMessages((prev) => {
                                    const next = [...prev];
                                    const last = next[next.length - 1];
                                    if (last?.role === 'assistant') {
                                        next[next.length - 1] = {
                                            ...last,
                                            content: last.content + delta,
                                        };
                                    }
                                    return next;
                                });
                            } catch {
                                // skip malformed chunk
                            }
                        }
                    }
                } else {
                    const data = (await res.json()) as {
                        choices?: Array<{ message?: { content?: string } }>;
                    };
                    const reply = data.choices?.[0]?.message?.content ?? '';
                    setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
                }
            } catch (err) {
                const e = err instanceof Error ? err : new Error(String(err));
                setError(e.message);
                onError?.(e);
                // Roll the optimistic user turn back so they can retry.
                setMessages((prev) =>
                    prev.filter((m, i) => !(i === prev.length - 1 && m.role === 'user' && m.content === trimmed))
                );
                setInput(trimmed);
            } finally {
                setBusy(false);
            }
        },
        [
            apiKey, busy, endpoint, hideMemoryIndicator, maxTokens, memory, messages,
            model, onError, onMemoryRetrieved, stream, system, temperature,
        ]
    );

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        void send(input);
    };

    const visible = messages.filter((m) => m.role !== 'system');

    return (
        <div
            className={`flex flex-col h-full min-h-[24rem] rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 ${className ?? ''}`}
        >
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {visible.length === 0 && (
                    <div className="h-full flex items-center justify-center text-sm text-neutral-400">
                        {emptyState ?? 'Start the conversation.'}
                    </div>
                )}
                {visible.map((m, i) => (
                    <div
                        key={i}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                                m.role === 'user'
                                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                                    : 'bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
                            }`}
                        >
                            {m.content || (busy && i === visible.length - 1 ? '…' : '')}
                        </div>
                    </div>
                ))}
            </div>

            {memory && !hideMemoryIndicator && recalled !== null && (
                <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-neutral-500 border-t border-neutral-100 dark:border-neutral-900">
                    <Brain className="h-3.5 w-3.5" />
                    {recalled > 0
                        ? `Recalled ${recalled} ${recalled === 1 ? 'memory' : 'memories'} about this user`
                        : 'No prior memories yet — learning'}
                </div>
            )}

            {error && (
                <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>
            )}

            <form
                onSubmit={onSubmit}
                className="flex items-center gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800"
            >
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={placeholder}
                    disabled={busy}
                    className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm outline-none placeholder:text-neutral-400 disabled:opacity-60 dark:bg-neutral-900"
                />
                <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white transition disabled:opacity-40 dark:bg-white dark:text-neutral-900"
                    aria-label="Send"
                >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
            </form>
        </div>
    );
}
