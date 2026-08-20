/**
 * Shared AI client with Cerebras → Groq → Gemini fallback chain.
 *
 * Both Cerebras and Groq expose an OpenAI-compatible REST API, so
 * we call them directly with fetch — no extra SDK needed.
 */

const TIMEOUT_MS = 35_000;
const REASONING_MODEL = "gpt-oss-120b";   // Cerebras reasoning model
const FAST_MODEL = "llama3.1-8b";          // Cerebras fast streamer


export type AiProvider = "cerebras" | "groq" | "gemini";

interface ProviderConfig {
    name: AiProvider;
    baseURL: string;
    model: string;
    apiKey: string | undefined;
}

function getProviders(): ProviderConfig[] {
    return [
        {
            name: "cerebras",
            baseURL: "https://api.cerebras.ai/v1",
            model: "llama3.1-8b",
            apiKey: process.env.CEREBRAS_API_KEY,
        },
        {
            name: "groq",
            baseURL: "https://api.groq.com/openai/v1",
            model: "groq/compound",
            apiKey: process.env.GROQ_API_KEY,
        },
    ];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms)
        ),
    ]);
}

function normalizeAnalysisSteps(steps?: string[]): string[] {
    if (!Array.isArray(steps)) {
        return [];
    }

    return steps
        .map((step) => (typeof step === "string" ? step.trim() : ""))
        .filter((step) => step.length > 0)
        .slice(0, 8);
}

function sanitizeReasoningForReuse(reasoning: string): string {
    const metaPattern = /(first-person|third-person|emoji|system prompt|follow all personality|the user asks|need to respond as|must use|no emojis|casual messages short|prompt|respond conversationally|let'?s craft|speak as cencori|use \".*\"|should be brief|just answer)/i;
    const cleanedLines = reasoning
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !metaPattern.test(line));

    const cleaned = cleanedLines.join("\n");
    if (!cleaned) {
        return "";
    }

    return cleaned.length > 2000 ? cleaned.slice(0, 2000) : cleaned;
}

/**
 * Call a single OpenAI-compatible provider (non-streaming).
 */
async function callOpenAICompatible(
    config: ProviderConfig,
    prompt: string,
): Promise<string | null> {
    if (!config.apiKey) return null;

    const res = await withTimeout(
        fetch(`${config.baseURL}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0,
            }),
        }),
        TIMEOUT_MS
    );

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${config.name} HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
}

/**
 * Try each provider in order. Falls back to Gemini if all OpenAI-compatible
 * providers fail.
 */
export async function generateWithFallback(prompt: string): Promise<{
    model: string;
    provider: AiProvider | "gemini";
    text: string;
} | null> {
    for (const provider of getProviders()) {
        if (!provider.apiKey) {
            console.log(`[AI Client] Skipping ${provider.name} — no API key`);
            continue;
        }
        try {
            console.log(`[AI Client] Trying ${provider.name} (${provider.model})...`);
            const text = await callOpenAICompatible(provider, prompt);
            if (text) {
                console.log(`[AI Client] ✓ ${provider.name} responded`);
                return { model: provider.model, provider: provider.name, text };
            }
        } catch (err) {
            console.warn(`[AI Client] ${provider.name} failed:`, err instanceof Error ? err.message : err);
        }
    }

    // Gemini fallback
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiKey) {
        try {
            console.log("[AI Client] Falling back to Gemini...");
            const { GoogleGenerativeAI } = await import("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await withTimeout(model.generateContent(prompt), TIMEOUT_MS);
            const text = result.response.text().trim();
            if (text) {
                console.log("[AI Client] ✓ Gemini responded");
                return { model: "gemini-2.5-flash", provider: "gemini", text };
            }
        } catch (err) {
            console.warn("[AI Client] Gemini fallback failed:", err instanceof Error ? err.message : err);
        }
    }

    console.error("[AI Client] All providers exhausted — no AI response");
    return null;
}

/**
 * Stream from Cerebras → Groq → Gemini, writing SSE chunks to the
 * provided ReadableStream controller.
 *
 * Chunks are emitted as: data: {"content":"..."}\n\n
 * Completion is signaled with: data: [DONE]\n\n
 */
export async function streamWithFallback(
    prompt: string,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
): Promise<void> {
    const enqueue = (payload: string) =>
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));

    for (const p of getProviders()) {
        if (!p.apiKey) continue;
        try {
            console.log(`[AI Client] Streaming from ${p.name}...`);
            const res = await withTimeout(
                fetch(`${p.baseURL}/chat/completions`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${p.apiKey}`,
                    },
                    body: JSON.stringify({
                        model: p.model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.3,
                        stream: true,
                    }),
                }),
                TIMEOUT_MS
            );

            if (!res.ok || !res.body) {
                const body = await res.text().catch(() => "");
                throw new Error(`${p.name} HTTP ${res.status}: ${body.slice(0, 200)}`);
            }

            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buffer = "";
            let gotContent = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += dec.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.replace(/^data:\s*/, "").trim();
                    if (!trimmed || trimmed === "[DONE]") continue;

                    try {
                        const parsed = JSON.parse(trimmed) as {
                            choices?: Array<{ delta?: { content?: string } }>;
                        };
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            enqueue(JSON.stringify({ content }));
                            gotContent = true;
                        }
                    } catch {
                        // skip malformed chunk
                    }
                }
            }

            if (gotContent) {
                console.log(`[AI Client] ✓ ${p.name} stream complete`);
                enqueue("[DONE]");
                controller.close();
                return;
            }
        } catch (err) {
            console.warn(`[AI Client] ${p.name} stream failed:`, err instanceof Error ? err.message : err);
        }
    }

    // Gemini streaming fallback
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiKey) {
        try {
            console.log("[AI Client] Streaming from Gemini fallback...");
            const { GoogleGenerativeAI } = await import("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContentStream(prompt);

            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) enqueue(JSON.stringify({ content: text }));
            }

            enqueue("[DONE]");
            controller.close();
            return;
        } catch (err) {
            console.warn("[AI Client] Gemini stream failed:", err instanceof Error ? err.message : err);
        }
    }

    // Total failure — close cleanly without content
    enqueue("[DONE]");
    controller.close();
}

/**
 * Dual-model reasoning stream:
 *
 * Phase 1 — gpt-oss-120b (Cerebras reasoning model)
 *   Keeps raw delta.reasoning tokens private for internal answer drafting.
 *
 * Phase 2 — content generation with fallback chain:
 *   Cerebras llama3.1-8b → Groq Compound → Gemini
 *   Streams delta.content → SSE: {"type":"content","content":"..."}
 *
 * Visible investigation state:
 *   Emits curated SSE analysis updates → {"type":"analysis","content":"..."}
 *
 * Completion: data: [DONE]
 */
export async function streamWithReasoning(
    prompt: string,
    systemPrompt: string,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    fallbackContent?: string,
    onContentChunk?: (chunk: string) => void,
    options?: {
        emitDone?: boolean;
        closeController?: boolean;
        analysisSteps?: string[];
        draftAnalysisStep?: string;
        firstContentAnalysisStep?: string;
        buildFinalAnalysis?: (input: {
            response: string;
            contentEmitted: boolean;
            usedFallback: boolean;
        }) => string[];
    },
): Promise<void> {
    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    const cerebrasBase = "https://api.cerebras.ai/v1";
    let contentEmitted = false;
    let usedFallback = false;
    let assembledResponse = "";
    const analysisSteps = normalizeAnalysisSteps(options?.analysisSteps);
    let analysisIndex = 0;
    let firstContentAnalysisEmitted = false;
    const emittedAnalysis = new Set<string>();

    const enqueue = (payload: string) =>
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
    const emitDone = options?.emitDone ?? true;
    const closeController = options?.closeController ?? true;
    const finalizeStream = () => {
        if (emitDone) enqueue("[DONE]");
        if (closeController) controller.close();
    };

    const emitAnalysisStep = (text: string) => {
        const normalized = text.trim();
        if (!normalized || emittedAnalysis.has(normalized)) {
            return;
        }
        emittedAnalysis.add(normalized);
        enqueue(JSON.stringify({ type: "analysis", content: `${normalized}\n` }));
    };

    const advanceAnalysis = (fallbackStep?: string) => {
        const nextStep = analysisSteps[analysisIndex] || fallbackStep;
        if (!nextStep) {
            return;
        }
        analysisIndex += analysisSteps[analysisIndex] ? 1 : 0;
        emitAnalysisStep(nextStep);
    };

    const flushRemainingAnalysis = () => {
        while (analysisIndex < analysisSteps.length) {
            emitAnalysisStep(analysisSteps[analysisIndex]);
            analysisIndex += 1;
        }
    };

    const emitContent = (text: string) => {
        if (!firstContentAnalysisEmitted && options?.firstContentAnalysisStep) {
            emitAnalysisStep(options.firstContentAnalysisStep);
            firstContentAnalysisEmitted = true;
        }
        enqueue(JSON.stringify({ type: "content", content: text }));
        contentEmitted = true;
        assembledResponse += text;
        onContentChunk?.(text);
    };

    const emitFinalAnalysis = () => {
        flushRemainingAnalysis();

        const finalSteps = normalizeAnalysisSteps(
            options?.buildFinalAnalysis?.({
                response: assembledResponse,
                contentEmitted,
                usedFallback,
            })
        );

        for (const step of finalSteps) {
            emitAnalysisStep(step);
        }
    };

    // Helper: read a streaming OpenAI-compatible response and emit content chunks
    async function streamOpenAIContent(
        baseURL: string,
        apiKey: string,
        model: string,
        messages: Array<{ role: string; content: string }>,
    ): Promise<boolean> {
        const res = await withTimeout(
            fetch(`${baseURL}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({ model, messages, temperature: 0.5, stream: true }),
            }),
            TIMEOUT_MS
        );

        if (!res.ok || !res.body) {
            const errBody = await res.text().catch(() => "");
            console.warn(`[AI Client] ${model} HTTP ${res.status}: ${errBody.slice(0, 200)}`);
            return false;
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buffer = "";
        let gotContent = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += dec.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = line.replace(/^data:\s*/, "").trim();
                if (!trimmed || trimmed === "[DONE]") continue;
                try {
                    const parsed = JSON.parse(trimmed) as {
                        choices?: Array<{ delta?: { content?: string } }>;
                    };
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) { emitContent(content); gotContent = true; }
                } catch { /* skip */ }
            }
        }
        return gotContent;
    }

    // ── Phase 1: reasoning with gpt-oss-120b ─────────────────────────────────
    let reasoningOutput = "";
    advanceAnalysis("Reviewing the available security context and code evidence");

    if (cerebrasKey) {
        try {
            advanceAnalysis("Running deeper security reasoning on the gathered evidence");
            console.log("[AI Client] Phase 1: gpt-oss-120b reasoning...");
            const res = await withTimeout(
                fetch(`${cerebrasBase}/chat/completions`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${cerebrasKey}`,
                    },
                    body: JSON.stringify({
                        model: REASONING_MODEL,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: prompt },
                        ],
                        temperature: 0.6,
                        max_tokens: 2000,
                        stream: true,
                    }),
                }),
                TIMEOUT_MS
            );

            if (res.ok && res.body) {
                const reader = res.body.getReader();
                const dec = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += dec.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";
                    for (const line of lines) {
                        const trimmed = line.replace(/^data:\s*/, "").trim();
                        if (!trimmed || trimmed === "[DONE]") continue;
                        try {
                            const parsed = JSON.parse(trimmed) as {
                                choices?: Array<{ delta?: { reasoning?: string; content?: string } }>;
                            };
                            const delta = parsed.choices?.[0]?.delta;
                            if (delta?.reasoning) {
                                reasoningOutput += delta.reasoning;
                            }
                            if (delta?.content) {
                                reasoningOutput += delta.content;
                            }
                        } catch { /* skip malformed */ }
                    }
                }
                console.log(`[AI Client] Phase 1 complete — ${reasoningOutput.length} reasoning chars`);
            } else {
                const errBody = await res.text().catch(() => "");
                console.warn(`[AI Client] gpt-oss-120b HTTP ${res.status}: ${errBody.slice(0, 200)}`);
            }
        } catch (err) {
            console.warn("[AI Client] Phase 1 reasoning failed:", err instanceof Error ? err.message : err);
        }
    }

    // ── Phase 2: content generation with fallback chain ───────────────────────
    const reusableReasoning = sanitizeReasoningForReuse(reasoningOutput);
    advanceAnalysis();
    if (options?.draftAnalysisStep) {
        emitAnalysisStep(options.draftAnalysisStep);
    } else {
        advanceAnalysis("Drafting a response grounded in the collected evidence");
    }
    const contentMessages = [
        { role: "system", content: systemPrompt },
        {
            role: "user",
            content: reusableReasoning
                ? `Use this internal security analysis to improve your reply. Do not quote it, mention it, or repeat prompt instructions back to the user.\n\n<analysis>\n${reusableReasoning}\n</analysis>\n\n${prompt}`
                : prompt,
        },
    ];

    // Try Cerebras llama3.1-8b first
    if (cerebrasKey) {
        try {
            console.log("[AI Client] Phase 2: llama3.1-8b...");
            const ok = await streamOpenAIContent(cerebrasBase, cerebrasKey, FAST_MODEL, contentMessages);
            if (ok) {
                emitFinalAnalysis();
                console.log("[AI Client] ✓ Phase 2 via Cerebras llama");
                finalizeStream();
                return;
            }
        } catch (err) {
            console.warn("[AI Client] Phase 2 Cerebras failed:", err instanceof Error ? err.message : err);
        }
    }

    // Groq fallback
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        try {
            console.log("[AI Client] Phase 2: Groq Compound...");
            const ok = await streamOpenAIContent(
                "https://api.groq.com/openai/v1",
                groqKey,
                "groq/compound",
                contentMessages,
            );
            if (ok) {
                emitFinalAnalysis();
                console.log("[AI Client] ✓ Phase 2 via Groq");
                finalizeStream();
                return;
            }
        } catch (err) {
            console.warn("[AI Client] Phase 2 Groq failed:", err instanceof Error ? err.message : err);
        }
    }

    // Gemini final fallback
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiKey) {
        try {
            console.log("[AI Client] Phase 2: Gemini fallback...");
            const { GoogleGenerativeAI } = await import("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const userMsg = contentMessages[contentMessages.length - 1].content;
            const result = await model.generateContentStream(userMsg);
            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) emitContent(text);
            }
            emitFinalAnalysis();
            console.log("[AI Client] ✓ Phase 2 via Gemini");
        } catch (err) {
            console.warn("[AI Client] Phase 2 Gemini failed:", err instanceof Error ? err.message : err);
        }
    }

    // If nothing was emitted at all — emit fallback so the message is never blank
    if (!contentEmitted && fallbackContent) {
        console.log("[AI Client] All providers failed — emitting fallback content");
        usedFallback = true;
        emitContent(fallbackContent);
    } else if (!contentEmitted) {
        console.warn("[AI Client] All providers failed and no fallback provided — stream is empty");
    }

    emitFinalAnalysis();
    finalizeStream();
}
