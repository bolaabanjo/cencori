/**
 * Responses API execution layer.
 * Translates OpenAI Responses API format ↔ Cencori internal format,
 * handles built-in tools, and formats responses.
 */

import { NextResponse } from 'next/server';
import {
    type TokenUsage,
    type UnifiedMessage,
    type Tool,
    type UnifiedChatRequest,
} from '@/lib/providers/base';
import { settleStreamUsage } from '@/lib/gateway/stream-usage';
import { executeGatewayChat, streamGatewayChat } from '@/lib/gateway/chat-executor';
import { resolveGatewayProvider } from '@/lib/gateway/providers-setup';
import { mapProviderErrorToHttpResponse } from '@/lib/gateway-reliability';
import type { GatewayContext } from '@/lib/gateway-middleware';
import type { SubscriptionTier } from '@/lib/entitlements';
import { calculateGatewayCharge } from '@/lib/gateway/model-access';
import type { QuotaCheckResult } from '@/lib/end-user-billing';
import type { SecurityCheckResult } from '@/lib/safety/multi-layer-check';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import {
    STREAM_GUARD_EMIT_BATCH_CHARS,
    STREAM_GUARD_HOLDBACK_CHARS,
} from '@/lib/gateway/stream-guard';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import {
    normalizeResponsesContent,
    type ResponsesContentPart,
    toolOutputTurns,
} from '@/lib/gateway/responses-content';
import {
    preProcessBuiltInTools,
    executeCodeInterpreter,
    indexFileContent,
    type ResponsesBuiltInTool,
    type ToolCallOutput,
} from '@/lib/gateway/v1-responses-tools';
import { storeResponse, getResponse } from '@/lib/gateway/v1-responses-store';
import type { ToolCallPayload } from '@/lib/gateway/v1-types';

// ── Types ──

export type ResponseFormat =
    | { type: 'text' }
    | { type: 'json_object' }
    | { type: 'json_schema'; json_schema: { name: string; description?: string; schema: Record<string, unknown>; strict?: boolean } };

/**
 * Message content and tool output are a string or a list of content parts. An agent's image tool
 * answers with parts, and so does a user turn that carries a screenshot.
 */
export type ResponseInputItem =
    | { type: 'message'; role: 'user' | 'assistant' | 'system'; content: string | ResponsesContentPart[] }
    | { type: 'function_call'; id: string; call_id: string; name: string; arguments: string; status?: string }
    | { type: 'function_call_output'; call_id: string; output: string | ResponsesContentPart[] }
    | { type: 'file'; filename: string; content: string; mime_type?: string };

export type ResponsesTool = ResponsesBuiltInTool | Tool;

export type ResponsesRequest = {
    model: string;
    input: string | ResponseInputItem[];
    instructions?: string;
    tools?: ResponsesTool[];
    tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
    temperature?: number;
    max_output_tokens?: number;
    top_p?: number;
    store?: boolean;
    metadata?: Record<string, string>;
    previous_response_id?: string;
    response_format?: ResponseFormat;
    include?: string[];
    parallel_tool_calls?: boolean;
    truncation?: 'auto' | 'disabled';
    stream?: boolean;
    user?: string;
};

export type ResponsesUsage = {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_tokens_details?: {
        cached_tokens?: number;
        text_tokens?: number;
        audio_tokens?: number;
    };
    output_tokens_details?: {
        text_tokens?: number;
        audio_tokens?: number;
    };
};

export type ResponsesOutputItem = {
    id: string;
    type: 'message' | 'function_call' | 'web_search_call' | 'file_search_call' | 'code_interpreter_call' | 'reasoning';
    status?: 'completed' | 'failed' | 'in_progress';
    role?: 'assistant';
    content?: Array<{
        type: 'output_text' | 'refusal';
        text?: string;
        annotations?: Array<unknown>;
    }>;
    call_id?: string;
    name?: string;
    arguments?: string;
    output?: Record<string, unknown>;
    error?: string;
};

export type ResponsesResponse = {
    id: string;
    object: 'response';
    created: number;
    model: string;
    output: ResponsesOutputItem[];
    usage: ResponsesUsage;
    status: 'completed' | 'failed' | 'in_progress';
    /**
     * Why a failed response failed, in the response object where the Responses API puts it.
     *
     * Clients read `response.error.message` — a sibling of `response` is not looked at — so a
     * failed stream that omits this reports itself as a bare "upstream response failed" and the
     * real cause never leaves the gateway.
     */
    error?: { code: string; message: string };
    metadata?: Record<string, string>;
};

type V1ResponseExecuteParams = {
    supabase: ReturnType<typeof import('@/lib/supabaseAdmin').createAdminClient>;
    gatewayCtx: GatewayContext;
    model: string;
    body: ResponsesRequest;
    /** Pre-parsed messages from the security pipeline. When provided, body.input is not re-parsed. */
    messages?: UnifiedMessage[];
    inputText: string;
    inputSecurity: SecurityCheckResult;
    tokenMap?: Map<string, string>;
    endUserId: string | null;
    endUserQuota: QuotaCheckResult | null;
    tier: SubscriptionTier;
    recordEndUserUsage: (usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        providerCostUsd: number;
        cencoriChargeUsd: number;
        markupPercentage: number;
    }) => void;
    logSuccess: (meta: {
        provider: string;
        model: string;
        status: 'success' | 'success_fallback' | 'error';
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        providerCostUsd: number;
        cencoriChargeUsd: number;
        markupPercentage: number;
        errorMessage?: string;
        /**
         * Model output, so the request log has something to show in the console.
         * Left unset on guard-blocked paths — nothing was delivered to the caller.
         */
        responseText?: string;
    }) => void;
    incrementUsage: (chargeUsd: number) => void;
    agentId?: string | null;
    shadowMode?: boolean;
    createPendingAction?: (toolCall: ToolCallPayload) => Promise<string | null>;
    createDispatchedAction?: (toolCall: ToolCallPayload) => void;
};

export type V1ResponseExecuteResult =
    | { ok: true; response: NextResponse }
    | { ok: false; status: number; body: Record<string, unknown> };

// ── Input Parsing ──

function parseInputToMessages(
    input: string | ResponseInputItem[],
    instructions?: string,
): UnifiedMessage[] {
    const messages: UnifiedMessage[] = [];

    if (instructions) {
        messages.push({ role: 'system', content: instructions });
    }

    if (typeof input === 'string') {
        messages.push({ role: 'user', content: input });
        return messages;
    }

    for (const item of input) {
        switch (item.type) {
            case 'message': {
                const { text, images } = normalizeResponsesContent(item.content);
                messages.push({
                    role: item.role,
                    content: text,
                    ...(images.length ? { images } : {}),
                });
                break;
            }
            case 'function_call':
                messages.push({
                    role: 'assistant',
                    content: '',
                    toolCallId: item.call_id,
                });
                break;
            case 'function_call_output':
                messages.push(...toolOutputTurns(item.output, item.call_id));
                break;
            case 'file':
                messages.push({
                    role: 'user',
                    content: `[File: ${item.filename}]${item.mime_type ? ` (${item.mime_type})` : ''}\n\n${item.content}`,
                });
                break;
        }
    }

    return messages;
}

function extractTools(tools?: ResponsesTool[]): {
    functionTools: Tool[];
    builtInTools: ResponsesBuiltInTool[];
} {
    const functionTools: Tool[] = [];
    const builtInTools: ResponsesBuiltInTool[] = [];

    if (!tools) return { functionTools, builtInTools };

    for (const tool of tools) {
        if (tool.type === 'function') {
            functionTools.push(tool as Tool);
        } else {
            builtInTools.push(tool as ResponsesBuiltInTool);
        }
    }

    return { functionTools, builtInTools };
}

// ── Response Building ──

function generateId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function buildResponsesJson(params: {
    model: string;
    content: string;
    toolOutputs: ToolCallOutput[];
    functionCalls?: Array<{ id: string; name: string; arguments: string; callId: string }>;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        cacheReadTokens?: number;
    };
    status?: 'completed' | 'failed';
    annotations?: Array<{ type: string; start_index: number; end_index: number; url: string; title?: string }>;
    error?: { code: string; message: string };
    metadata?: Record<string, string>;
}): ResponsesResponse {
    const output: ResponsesOutputItem[] = [];

    if (params.content) {
        output.push({
            id: generateId('msg'),
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: params.content, annotations: params.annotations ?? [] }],
        });
    }

    if (params.functionCalls) {
        for (const fc of params.functionCalls) {
            output.push({
                id: generateId('fc'),
                type: 'function_call',
                status: 'completed',
                call_id: fc.callId,
                name: fc.name,
                arguments: fc.arguments,
            });
        }
    }

    for (const toolOutput of params.toolOutputs) {
        output.push({
            id: toolOutput.id,
            type: toolOutput.type,
            status: toolOutput.status,
            ...(toolOutput.output ? { output: toolOutput.output } : {}),
            ...(toolOutput.error ? { error: toolOutput.error } : {}),
        });
    }

    return {
        id: generateId('resp'),
        object: 'response',
        created: Math.floor(Date.now() / 1000),
        model: params.model,
        output,
        usage: {
            input_tokens: params.usage.promptTokens,
            output_tokens: params.usage.completionTokens,
            total_tokens: params.usage.totalTokens,
            input_tokens_details: {
                // Cached tokens are part of the prompt, so text tokens are what is left after
                // them; reporting the whole prompt as text double-counted the cached part.
                text_tokens: Math.max(
                    0,
                    params.usage.promptTokens - (params.usage.cacheReadTokens ?? 0),
                ),
                // Always present, never omitted. It was hardcoded to 0, which made prompt
                // caching unobservable — a cold prefix and a fully cached one reported
                // identically — so this now carries the real figure. But the field itself is
                // required by the Responses API shape: the agent runtime deserializes
                // `cached_tokens: i64` with no serde default, so omitting it fails the whole
                // response with "missing field `cached_tokens`" and kills the turn. Unlike
                // /v1/chat/completions, this endpoint cannot express "the provider said
                // nothing" — it reports 0, and 0 here means unknown-or-miss.
                cached_tokens: params.usage.cacheReadTokens ?? 0,
            },
            output_tokens_details: {
                text_tokens: params.usage.completionTokens,
            },
        },
        status: params.status || 'completed',
        ...(params.error ? { error: params.error } : {}),
        ...(params.metadata && Object.keys(params.metadata).length > 0 ? { metadata: params.metadata } : {}),
    };
}

function providerFailureResult(error: unknown, model?: string): V1ResponseExecuteResult {
    const failure = mapProviderErrorToHttpResponse(error, undefined, model);
    const body: Record<string, unknown> = {
        error: {
            message: failure.message,
            type: 'invalid_request_error',
            code: failure.error,
        },
        status: 'failed',
    };
    if (failure.retryAfter != null) {
        body.retry_after = failure.retryAfter;
    }
    return { ok: false, status: failure.status, body };
}

// ── Streaming ──

function buildResponsesStreamChunk(params: {
    type: 'response.output_text.delta' | 'response.output_text.done' | 'response.reasoning_summary_text.delta' | 'response.reasoning_summary_text.done' | 'response.function_call_arguments.delta' | 'response.function_call_arguments.done' | 'response.web_search_call.completed' | 'response.file_search_call.completed' | 'response.code_interpreter_call.completed' | 'response.done';
    data: Record<string, unknown>;
}): string {
    return `event: ${params.type}\ndata: ${JSON.stringify(params.data)}\n\n`;
}

// ── Main Execution ──

export async function runV1ResponsesExecution(
    params: V1ResponseExecuteParams
): Promise<V1ResponseExecuteResult> {
    const { gatewayCtx, model, body, inputSecurity, inputText, tokenMap, tier } = params;
    const effectiveTokenMap = new Map(tokenMap ?? []);

    try {
        const resolved = await resolveGatewayProvider({
            supabase: params.supabase,
            projectId: gatewayCtx.projectId,
            organizationId: gatewayCtx.organizationId,
            requestedModel: model,
            allowedModels: gatewayCtx.allowedModels,
            sponsoredModels: gatewayCtx.sponsoredModels,
        });

        // Separate function tools from built-in tools
        const { functionTools, builtInTools } = extractTools(body.tools);

        // Make files supplied on this request searchable during this request,
        // before built-in file_search is pre-processed.
        if (builtInTools.some(tool => tool.type === 'file_search') && typeof body.input !== 'string') {
            const fileItems = body.input.filter((i): i is { type: 'file'; filename: string; content: string; mime_type?: string } => i.type === 'file');
            for (const file of fileItems) {
                await indexFileContent(gatewayCtx.projectId, file.filename, file.content);
            }
        }

        // Pre-process built-in tools (web search, file search)
        const userInputText = typeof body.input === 'string' ? body.input : '';
        const preProcessResult = builtInTools.length > 0
            ? await preProcessBuiltInTools(
                  userInputText || inputText,
                  builtInTools,
                  gatewayCtx.projectId
              )
            : { systemContext: '', toolOutputs: [] as ToolCallOutput[] };

        // Search/file results are untrusted external input and can contain
        // prompt injection or project-rule matches. Scan and transform them
        // before they become a privileged system message.
        if (preProcessResult.systemContext) {
            const contextPipeline = await runGatewayInputPipeline({
                supabase: params.supabase,
                projectId: gatewayCtx.projectId,
                apiKeyId: gatewayCtx.apiKeyId,
                environment: gatewayCtx.environment,
                tier,
                messages: [{ role: 'user', content: preProcessResult.systemContext }],
                endUserId: params.endUserId,
            });
            if (!contextPipeline.ok) {
                preProcessResult.systemContext = '';
                for (const output of preProcessResult.toolOutputs) {
                    output.status = 'failed';
                    output.error = 'Retrieved context was blocked by the project security policy';
                    delete output.output;
                }
            } else {
                preProcessResult.systemContext = contextPipeline.messages[0]?.content ?? '';
                // Do not merge the external context's token map. Tokens from
                // web/file results must stay redacted in model output rather
                // than being rehydrated into newly fetched sensitive data.
            }
        }

        const messages = params.messages ?? parseInputToMessages(body.input, body.instructions);

        // Inject built-in tool context as system message
        if (preProcessResult.systemContext) {
            const citationInstruction = builtInTools.some(t => t.type === 'web_search_preview')
                ? `\n\nWhen citing information from search results, reference them using [N] notation where N is the result number (e.g., [1], [2]).`
                : '';
            messages.unshift({
                role: 'system',
                content: `You have access to the following real-time information. Use it to answer the user's question naturally.${citationInstruction}\n\n${preProcessResult.systemContext}`,
            });
        }

        // Resolve previous_response_id: fetch prior response and prepend its output
        if (body.previous_response_id) {
            const prior = await getResponse(params.supabase, gatewayCtx.projectId, body.previous_response_id);
            if (prior) {
                const priorMessages: UnifiedMessage[] = [];
                for (const item of prior.output) {
                    if (item.type === 'message' && item.content?.[0]?.text) {
                        priorMessages.push({ role: 'assistant', content: item.content[0].text });
                    }
                    if (item.type === 'function_call') {
                        priorMessages.push({
                            role: 'assistant',
                            content: '',
                            toolCallId: item.call_id || item.id,
                        });
                    }
                }
                let insertAt = 0;
                while (insertAt < messages.length && messages[insertAt].role === 'system') insertAt++;
                messages.splice(insertAt, 0, ...priorMessages);
            }
        }

        // Handle response_format: json_schema → hidden structured output tool
        let forceSchemaResult = false;
        let schemaToolName: string | null = null;
        if (body.response_format?.type === 'json_schema') {
            const schema = body.response_format.json_schema;
            schemaToolName = schema.name || 'structured_output';
            const schemaTool: Tool = {
                type: 'function',
                function: {
                    name: schemaToolName,
                    description: schema.description || 'Generate structured output matching the provided schema',
                    parameters: schema.schema,
                },
            };
            functionTools.push(schemaTool);
            forceSchemaResult = true;
        }

        if (functionTools.length > 0 && resolved.provider.supportsTools === false) {
            return {
                ok: false,
                status: 400,
                body: {
                    error: {
                        message: `Tool calling is not implemented for provider '${resolved.providerName}'.`,
                        type: 'invalid_request_error',
                        code: 'tools_not_supported_by_provider',
                    },
                    status: 'failed',
                },
            };
        }

        const chatRequest: UnifiedChatRequest = {
            messages,
            model: resolved.model,
            temperature: body.temperature,
            maxTokens: body.max_output_tokens,
            stream: body.stream || false,
            tools: functionTools.length > 0 ? functionTools : undefined,
            toolChoice: forceSchemaResult && schemaToolName
                ? { type: 'function' as const, function: { name: schemaToolName } }
                : body.tool_choice === 'none'
                ? 'none'
                : body.tool_choice === 'required'
                ? 'required'
                : body.tool_choice && typeof body.tool_choice === 'object' && 'name' in body.tool_choice
                ? { type: 'function' as const, function: { name: (body.tool_choice as { name: string }).name } }
                : undefined,
            truncation: body.truncation,
            parallelToolCalls: body.parallel_tool_calls,
            userId: params.endUserId || undefined,
        };

        // Check if code_interpreter is enabled
        const codeInterpreterEnabled = builtInTools.some(t => t.type === 'code_interpreter');

        if (!body.stream) {
            // ── Non-Streaming ──
            const result = await executeGatewayChat({
                supabase: params.supabase,
                projectId: gatewayCtx.projectId,
                organizationId: gatewayCtx.organizationId,
                allowedModels: gatewayCtx.allowedModels,
                sponsoredModels: gatewayCtx.sponsoredModels,
                tier,
                request: chatRequest,
                resolved,
                requestId: gatewayCtx.requestId,
            });

            let content = result.content;
            if (effectiveTokenMap.size > 0) {
                content = deTokenize(content, effectiveTokenMap);
            }

            // Extract structured output from tool call if response_format was json_schema
            if (forceSchemaResult && schemaToolName && result.toolCalls?.length) {
                const schemaCall = result.toolCalls.find(tc => tc.function.name === schemaToolName);
                if (schemaCall?.function.arguments) {
                    content = schemaCall.function.arguments;
                }
            }

            // Guard both visible text and model-generated tool arguments.
            const outputTextForGuard = [
                content,
                ...(result.toolCalls || []).map(call => call.function.arguments || ''),
            ].filter(Boolean).join('\n');
            const outputCheck = await runGatewayOutputGuard({
                supabase: params.supabase,
                projectId: gatewayCtx.projectId,
                apiKeyId: gatewayCtx.apiKeyId,
                environment: gatewayCtx.environment,
                outputText: outputTextForGuard,
                inputText,
                inputSecurity,
                conversationHistory: messages,
                endUserId: params.endUserId,
                organizationId: gatewayCtx.organizationId,
                model: result.actualModel,
                region: gatewayCtx.countryCode,
            });

            if (!outputCheck.ok) {
                const providerLogName = resolved.customProviderTag || result.actualProvider;
                params.logSuccess({
                    provider: providerLogName,
                    model: result.actualModel,
                    status: 'error',
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens,
                    providerCostUsd: result.cost.providerCostUsd,
                    cencoriChargeUsd: result.cost.cencoriChargeUsd,
                    markupPercentage: result.cost.markupPercentage,
                    errorMessage: outputCheck.message,
                });
                params.incrementUsage(result.cost.cencoriChargeUsd);
                params.recordEndUserUsage({
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens,
                    providerCostUsd: result.cost.providerCostUsd,
                    cencoriChargeUsd: result.cost.cencoriChargeUsd,
                    markupPercentage: result.cost.markupPercentage,
                });
                return {
                    ok: false,
                    status: outputCheck.status,
                    body: {
                        error: {
                            message: outputCheck.message,
                            type: 'invalid_request_error',
                            code: outputCheck.code,
                        },
                    },
                };
            }

            // Code Interpreter: if the model generated code, execute it
            const codeOutputs: ToolCallOutput[] = [...preProcessResult.toolOutputs];
            if (codeInterpreterEnabled && content) {
                const codeBlock = extractCodeBlock(content);
                if (codeBlock) {
                    const ciResult = await executeCodeInterpreter(codeBlock.code, codeBlock.language);
                    codeOutputs.push(ciResult);
                }
            }

            const openAiToolCalls = result.toolCalls?.map(tc => ({
                id: tc.id,
                name: tc.function.name,
                arguments: tc.function.arguments,
                callId: tc.id,
            }));

            // Shadow mode: create pending actions for tool calls
            if (params.agentId && openAiToolCalls && openAiToolCalls.length > 0) {
                if (params.shadowMode && params.createPendingAction) {
                    for (const tc of openAiToolCalls) {
                        await params.createPendingAction({
                            tool_call_id: tc.id,
                            tool: tc.name,
                            arguments: tc.arguments,
                        });
                    }
                } else if (params.createDispatchedAction) {
                    for (const tc of openAiToolCalls) {
                        params.createDispatchedAction({
                            tool_call_id: tc.id,
                            tool: tc.name,
                            arguments: tc.arguments,
                        });
                    }
                }
            }

            const providerLogName = resolved.customProviderTag || result.actualProvider;
            params.logSuccess({
                provider: providerLogName,
                model: result.actualModel,
                status: result.usedFallback ? 'success_fallback' : 'success',
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                totalTokens: result.usage.totalTokens,
                providerCostUsd: result.cost.providerCostUsd,
                cencoriChargeUsd: result.cost.cencoriChargeUsd,
                markupPercentage: result.cost.markupPercentage,
                responseText: content,
            });
            params.incrementUsage(result.cost.cencoriChargeUsd);
            params.recordEndUserUsage({
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                totalTokens: result.usage.totalTokens,
                providerCostUsd: result.cost.providerCostUsd,
                cencoriChargeUsd: result.cost.cencoriChargeUsd,
                markupPercentage: result.cost.markupPercentage,
            });

            const annotations = buildAnnotations(content, preProcessResult.toolOutputs);

            const json = buildResponsesJson({
                model: result.actualModel,
                content,
                toolOutputs: codeOutputs,
                functionCalls: openAiToolCalls,
                usage: result.usage,
                annotations,
                metadata: body.metadata,
            });

            if (body.store !== false) {
                await storeResponse(
                    params.supabase,
                    gatewayCtx.projectId,
                    gatewayCtx.organizationId,
                    json,
                );
            }

            return { ok: true, response: NextResponse.json(json) };
        }

        // ── Streaming ──
        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let fullText = '';
                // Real usage from the provider when the adapter reports it.
                let reportedUsage: TokenUsage | undefined;
                const collectedToolCalls: Record<string, { id: string; name: string; arguments: string }> = {};
                const collectedBuiltinToolOutputs: ToolCallOutput[] = [...preProcessResult.toolOutputs];

                /**
                 * How much of the raw `fullText` has been released, and the detokenized text that
                 * release produced.
                 *
                 * This endpoint used to accumulate the whole answer and emit it as a single
                 * `output_text.delta` once the guard approved it, so time-to-first-token equalled
                 * full generation time: a turn that generated for twelve seconds showed nothing
                 * for twelve. `/v1/chat/completions` solves the same problem without buffering —
                 * hold back a short rolling boundary, run the cumulative guard before every
                 * release, and run the full-output guard at completion — and that is what runs
                 * here now. No text reaches the client that the guard has not already seen.
                 */
                let releasedRawLength = 0;
                let emittedText = '';
                /**
                 * Reasoning is released on the same terms as the answer, never around them.
                 *
                 * It is model output like any other, so it goes through the same output guard: the
                 * alternative is a channel the guard never sees, which is a bypass for exactly what
                 * the guard exists to catch. It is emitted as its own event type rather than mixed
                 * into `output_text`, because it is the model thinking rather than the reply.
                 */
                let fullReasoning = '';
                let releasedReasoningLength = 0;
                /** Set when a mid-stream check fails: stop releasing and let completion report it. */
                let guardBlockedRelease = false;
                /**
                 * Structured output replaces `fullText` wholesale with the schema tool's arguments
                 * at completion, so there is no prefix that can be released early: whatever the
                 * model emits as text is discarded. That mode stays buffered.
                 */
                const releasesIncrementally = !(forceSchemaResult && schemaToolName);

                const detokenize = (text: string) =>
                    effectiveTokenMap.size > 0 ? deTokenize(text, effectiveTokenMap) : text;

                /**
                 * Never split a tokenization placeholder (for example "[EMAIL_1]") at the release
                 * boundary. A partial placeholder cannot be detokenized and would leak the
                 * internal marker to the client.
                 */
                const safeReleaseEnd = (proposedEnd: number) => {
                    let safeEnd = proposedEnd;
                    if (effectiveTokenMap.size > 0 && proposedEnd < fullText.length) {
                        const prefix = fullText.slice(0, proposedEnd);
                        for (const placeholder of effectiveTokenMap.keys()) {
                            const maxPartialLength = Math.min(placeholder.length - 1, prefix.length);
                            for (let partialLength = maxPartialLength; partialLength > 0; partialLength--) {
                                if (prefix.endsWith(placeholder.slice(0, partialLength))) {
                                    safeEnd = Math.min(safeEnd, proposedEnd - partialLength);
                                    break;
                                }
                            }
                        }
                    }

                    // Avoid emitting half of a UTF-16 surrogate pair.
                    if (safeEnd > 0) {
                        const previousCodeUnit = fullText.charCodeAt(safeEnd - 1);
                        if (previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff) {
                            safeEnd -= 1;
                        }
                    }
                    return Math.max(releasedRawLength, safeEnd);
                };

                /** Emits everything approved so far that the client has not already received. */
                const releaseApprovedText = () => {
                    const releaseEnd = safeReleaseEnd(
                        Math.max(releasedRawLength, fullText.length - STREAM_GUARD_HOLDBACK_CHARS)
                    );
                    if (releaseEnd <= releasedRawLength) return;

                    const approvedText = detokenize(fullText.slice(0, releaseEnd));
                    // Detokenizing a longer prefix must not rewrite what the client already has.
                    if (!approvedText.startsWith(emittedText)) return;

                    const delta = approvedText.slice(emittedText.length);
                    releasedRawLength = releaseEnd;
                    if (!delta) return;
                    emittedText = approvedText;
                    controller.enqueue(
                        encoder.encode(
                            buildResponsesStreamChunk({
                                type: 'response.output_text.delta',
                                data: { delta, index: 0 },
                            })
                        )
                    );
                };

                /** Emits reasoning the guard has approved, on the same holdback discipline. */
                const releaseApprovedReasoning = async () => {
                    const releasable =
                        fullReasoning.length - releasedReasoningLength - STREAM_GUARD_HOLDBACK_CHARS;
                    if (releasable < STREAM_GUARD_EMIT_BATCH_CHARS) return;

                    let releaseEnd = fullReasoning.length - STREAM_GUARD_HOLDBACK_CHARS;
                    // Never split a UTF-16 surrogate pair across two events.
                    const previousCodeUnit = fullReasoning.charCodeAt(releaseEnd - 1);
                    if (previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff) releaseEnd -= 1;
                    if (releaseEnd <= releasedReasoningLength) return;

                    const candidate = detokenize(fullReasoning.slice(0, releaseEnd));
                    const check = await runGatewayOutputGuard({
                        supabase: params.supabase,
                        projectId: gatewayCtx.projectId,
                        apiKeyId: gatewayCtx.apiKeyId,
                        environment: gatewayCtx.environment,
                        outputText: candidate,
                        inputText,
                        inputSecurity,
                        conversationHistory: messages,
                        endUserId: params.endUserId,
                        organizationId: gatewayCtx.organizationId,
                        model: resolved.model,
                        region: gatewayCtx.countryCode,
                    });
                    // A rejected check stops reasoning release for the rest of the turn. The answer
                    // has its own gate, and completion still runs the full-output guard.
                    if (!check.ok) {
                        releasedReasoningLength = Number.POSITIVE_INFINITY;
                        return;
                    }

                    const delta = candidate.slice(detokenize(fullReasoning.slice(0, releasedReasoningLength)).length);
                    releasedReasoningLength = releaseEnd;
                    if (!delta) return;
                    controller.enqueue(
                        encoder.encode(
                            buildResponsesStreamChunk({
                                type: 'response.reasoning_summary_text.delta',
                                data: { delta, index: 0 },
                            })
                        )
                    );
                };

                try {
                    for await (const chunk of streamGatewayChat({
                        supabase: params.supabase,
                        projectId: gatewayCtx.projectId,
                        organizationId: gatewayCtx.organizationId,
                        allowedModels: gatewayCtx.allowedModels,
                        sponsoredModels: gatewayCtx.sponsoredModels,
                        tier,
                        request: chatRequest,
                        resolved,
                        requestId: gatewayCtx.requestId,
                    })) {
                        if (chunk.usage) {
                            reportedUsage = chunk.usage;
                        }
                        if (chunk.delta) {
                            fullText += chunk.delta;
                        }
                        if (chunk.reasoningDelta) {
                            fullReasoning += chunk.reasoningDelta;
                            if (releasesIncrementally && !guardBlockedRelease) {
                                await releaseApprovedReasoning();
                            }
                        }

                        if (chunk.toolCalls) {
                            for (const tc of chunk.toolCalls) {
                                const key = tc.id || 'unknown';
                                if (!collectedToolCalls[key]) {
                                    collectedToolCalls[key] = { id: key, name: '', arguments: '' };
                                }
                                if (tc.function?.name) collectedToolCalls[key].name = tc.function.name;
                                if (tc.function?.arguments) {
                                    collectedToolCalls[key].arguments += tc.function.arguments;
                                }
                            }
                        }

                        // Release what the guard has approved, so the client sees the answer as it
                        // is produced rather than in one burst at the end. A failed check stops
                        // further release; completion still runs the full-output guard and reports
                        // the block, so nothing the guard rejected can reach the client.
                        if (releasesIncrementally && !guardBlockedRelease && !chunk.finishReason) {
                            const releasableCharacters =
                                fullText.length - releasedRawLength - STREAM_GUARD_HOLDBACK_CHARS;
                            if (releasableCharacters >= STREAM_GUARD_EMIT_BATCH_CHARS) {
                                const incrementalCheck = await runGatewayOutputGuard({
                                    supabase: params.supabase,
                                    projectId: gatewayCtx.projectId,
                                    apiKeyId: gatewayCtx.apiKeyId,
                                    environment: gatewayCtx.environment,
                                    outputText: detokenize(fullText),
                                    inputText,
                                    inputSecurity,
                                    conversationHistory: messages,
                                    endUserId: params.endUserId,
                                    organizationId: gatewayCtx.organizationId,
                                    model: resolved.model,
                                    region: gatewayCtx.countryCode,
                                });
                                if (incrementalCheck.ok) {
                                    releaseApprovedText();
                                } else {
                                    guardBlockedRelease = true;
                                }
                            }
                        }

                        if (chunk.finishReason) {
                            if (effectiveTokenMap.size > 0) {
                                fullText = deTokenize(fullText, effectiveTokenMap);
                            }

                            // Extract structured output before scanning so the
                            // actual client-visible payload is protected.
                            if (forceSchemaResult && schemaToolName) {
                                const schemaCall = Object.values(collectedToolCalls).find(tc => tc.name === schemaToolName);
                                if (schemaCall?.arguments) {
                                    fullText = schemaCall.arguments;
                                }
                            }

                            const toolCallValues = Object.values(collectedToolCalls).filter(
                                tc => !(forceSchemaResult && schemaToolName && tc.name === schemaToolName)
                            );
                            const outputTextForGuard = [
                                fullText,
                                ...toolCallValues.map(tc => tc.arguments),
                            ].filter(Boolean).join('\n');
                            const outputCheck = await runGatewayOutputGuard({
                                supabase: params.supabase,
                                projectId: gatewayCtx.projectId,
                                apiKeyId: gatewayCtx.apiKeyId,
                                environment: gatewayCtx.environment,
                                outputText: outputTextForGuard,
                                inputText,
                                inputSecurity,
                                conversationHistory: messages,
                                endUserId: params.endUserId,
                                organizationId: gatewayCtx.organizationId,
                                model: chunk.actualModel,
                                region: gatewayCtx.countryCode,
                            });

                            const streamProvider =
                                chunk.actualProvider !== resolved.providerName
                                && resolved.router.hasProvider(chunk.actualProvider)
                                    ? resolved.router.getProvider(chunk.actualProvider)
                                    : resolved.provider;
                            const pricing = await streamProvider.getPricing(chunk.actualModel);
                            const {
                                promptTokens,
                                completionTokens,
                                totalTokens,
                                providerCostUsd,
                                cacheReadTokens,
                            } = await settleStreamUsage({
                                reported: reportedUsage,
                                pricing,
                                estimate: async () => {
                                    const promptText = messages.map(m => m.content).join(' ');
                                    try {
                                        return {
                                            promptTokens: await streamProvider.countTokens(promptText, chunk.actualModel),
                                            completionTokens: await streamProvider.countTokens(fullText, chunk.actualModel),
                                        };
                                    } catch {
                                        return {
                                            promptTokens: Math.max(1, Math.ceil(promptText.length / 4)),
                                            completionTokens: Math.max(1, Math.ceil(fullText.length / 4)),
                                        };
                                    }
                                },
                            });
                            const { cencoriChargeUsd, markupPercentage } = calculateGatewayCharge(
                                providerCostUsd,
                                pricing,
                                chunk.billingMode,
                            );

                            if (!outputCheck.ok) {
                                const providerLogName = resolved.customProviderTag || chunk.actualProvider;
                                params.logSuccess({
                                    provider: providerLogName,
                                    model: chunk.actualModel,
                                    status: 'error',
                                    promptTokens,
                                    completionTokens,
                                    totalTokens,
                                    providerCostUsd,
                                    cencoriChargeUsd,
                                    markupPercentage,
                                    errorMessage: outputCheck.message,
                                });
                                params.incrementUsage(cencoriChargeUsd);
                                params.recordEndUserUsage({
                                    promptTokens,
                                    completionTokens,
                                    totalTokens,
                                    providerCostUsd,
                                    cencoriChargeUsd,
                                    markupPercentage,
                                });

                                const failedResponse = buildResponsesJson({
                                    model: chunk.actualModel,
                                    content: '',
                                    toolOutputs: collectedBuiltinToolOutputs,
                                    usage: { promptTokens, completionTokens, totalTokens, cacheReadTokens },
                                    status: 'failed',
                                    // Also on the response itself: the sibling `error` below is
                                    // what the OpenAI SDK surfaces, but clients reading the
                                    // Responses shape look inside `response`, and a block that
                                    // cannot say why it blocked is indistinguishable from a crash.
                                    error: { code: outputCheck.code, message: outputCheck.message },
                                    metadata: body.metadata,
                                });
                                controller.enqueue(encoder.encode(buildResponsesStreamChunk({
                                    type: 'response.done',
                                    data: {
                                        response: failedResponse,
                                        error: { code: outputCheck.code, message: outputCheck.message },
                                    },
                                })));
                                controller.close();
                                return;
                            }

                            // Everything still held back: the rolling boundary above, plus the
                            // whole answer when this stream never released incrementally. The
                            // full-output guard has just passed, so the remainder is approved.
                            // `fullText` is detokenized by this point, and `emittedText` is the
                            // detokenized prefix already sent, so the difference is what is owed.
                            // If the prefix ever disagreed, re-sending the whole answer would give
                            // the client the prefix twice. `output_text.done` below carries the
                            // authoritative full text, so emitting nothing extra is the safe side.
                            /**
                             * Reasoning closes before the answer does. The full-output guard has
                             * just passed, so the held-back tail is approved; a turn whose
                             * reasoning was blocked mid-stream keeps its release length at
                             * infinity and emits nothing further.
                             */
                            if (fullReasoning && Number.isFinite(releasedReasoningLength)) {
                                const finalReasoning = detokenize(fullReasoning);
                                const sent = detokenize(fullReasoning.slice(0, releasedReasoningLength));
                                const reasoningTail = finalReasoning.startsWith(sent)
                                    ? finalReasoning.slice(sent.length)
                                    : '';
                                if (reasoningTail) {
                                    controller.enqueue(
                                        encoder.encode(
                                            buildResponsesStreamChunk({
                                                type: 'response.reasoning_summary_text.delta',
                                                data: { delta: reasoningTail, index: 0 },
                                            })
                                        )
                                    );
                                }
                                controller.enqueue(
                                    encoder.encode(
                                        buildResponsesStreamChunk({
                                            type: 'response.reasoning_summary_text.done',
                                            data: { text: finalReasoning, index: 0 },
                                        })
                                    )
                                );
                            }

                            const remainder = fullText.startsWith(emittedText)
                                ? fullText.slice(emittedText.length)
                                : '';
                            if (remainder) {
                                controller.enqueue(
                                    encoder.encode(
                                        buildResponsesStreamChunk({
                                            type: 'response.output_text.delta',
                                            data: { delta: remainder, index: 0 },
                                        })
                                    )
                                );
                            }
                            // Send output_text.done
                            controller.enqueue(
                                encoder.encode(
                                    buildResponsesStreamChunk({
                                        type: 'response.output_text.done',
                                        data: { index: 0, text: fullText },
                                    })
                                )
                            );

                            // Send built-in tool results
                            for (const toolOutput of collectedBuiltinToolOutputs) {
                                const eventType = toolOutput.type === 'web_search_call'
                                    ? 'response.web_search_call.completed'
                                    : toolOutput.type === 'file_search_call'
                                    ? 'response.file_search_call.completed'
                                    : 'response.code_interpreter_call.completed';
                                controller.enqueue(
                                    encoder.encode(
                                        buildResponsesStreamChunk({
                                            type: eventType as 'response.web_search_call.completed',
                                            data: { id: toolOutput.id, output: toolOutput.output, status: toolOutput.status },
                                        })
                                    )
                                );
                            }

                            // Code interpreter on full text in streaming mode
                            if (codeInterpreterEnabled && fullText) {
                                const codeBlock = extractCodeBlock(fullText);
                                if (codeBlock) {
                                    const ciResult = await executeCodeInterpreter(codeBlock.code, codeBlock.language);
                                    controller.enqueue(
                                        encoder.encode(
                                            buildResponsesStreamChunk({
                                                type: 'response.code_interpreter_call.completed',
                                                data: { id: ciResult.id, output: ciResult.output, status: ciResult.status },
                                            })
                                        )
                                    );
                                }
                            }

                            // Send function call results (skip the schema tool if used for response_format)
                            for (const tc of toolCallValues) {
                                controller.enqueue(
                                    encoder.encode(
                                        buildResponsesStreamChunk({
                                            type: 'response.function_call_arguments.done',
                                            data: {
                                                id: tc.id,
                                                name: tc.name,
                                                arguments: tc.arguments,
                                            },
                                        })
                                    )
                                );
                            }

                            // Shadow mode: create pending/executed actions for tool calls
                            if (params.agentId && toolCallValues.length > 0) {
                                if (params.shadowMode && params.createPendingAction) {
                                    for (const tc of toolCallValues) {
                                        await params.createPendingAction({
                                            tool_call_id: tc.id,
                                            tool: tc.name,
                                            arguments: tc.arguments,
                                        });
                                    }
                                } else if (params.createDispatchedAction) {
                                    for (const tc of toolCallValues) {
                                        params.createDispatchedAction({
                                            tool_call_id: tc.id,
                                            tool: tc.name,
                                            arguments: tc.arguments,
                                        });
                                    }
                                }
                            }

                            const providerLogName = resolved.customProviderTag || chunk.actualProvider;
                            params.logSuccess({
                                provider: providerLogName,
                                model: chunk.actualModel,
                                status: chunk.usedFallback ? 'success_fallback' : 'success',
                                promptTokens,
                                completionTokens,
                                totalTokens,
                                providerCostUsd,
                                cencoriChargeUsd,
                                markupPercentage,
                                responseText: fullText,
                            });
                            params.incrementUsage(cencoriChargeUsd);
                            params.recordEndUserUsage({
                                promptTokens,
                                completionTokens,
                                totalTokens,
                                providerCostUsd,
                                cencoriChargeUsd,
                                markupPercentage,
                            });

                            const annotations = buildAnnotations(fullText, collectedBuiltinToolOutputs);

                            const response = buildResponsesJson({
                                model: chunk.actualModel,
                                content: fullText,
                                toolOutputs: collectedBuiltinToolOutputs,
                                functionCalls: toolCallValues.map(tc => ({
                                    id: tc.id,
                                    name: tc.name,
                                    arguments: tc.arguments,
                                    callId: tc.id,
                                })),
                                usage: { promptTokens, completionTokens, totalTokens, cacheReadTokens },
                                annotations,
                                metadata: body.metadata,
                            });

                            if (body.store !== false) {
                                await storeResponse(
                                    params.supabase,
                                    gatewayCtx.projectId,
                                    gatewayCtx.organizationId,
                                    response,
                                );
                            }

                            controller.enqueue(
                                encoder.encode(
                                    buildResponsesStreamChunk({
                                        type: 'response.done',
                                        data: { response },
                                    })
                                )
                            );
                            controller.close();
                        }
                    }
                } catch (error) {
                    // The message was computed and dropped here, so every mid-stream provider
                    // failure reached the client as a bare "upstream response failed" with the
                    // real cause — rate limits, an exhausted provider, a retired model — left
                    // behind in the gateway. Carry it on the response the client actually reads.
                    const message = error instanceof Error ? error.message : 'Stream failed';
                    const failedResponse = buildResponsesJson({
                        model: body.model || model,
                        content: fullText || '',
                        toolOutputs: collectedBuiltinToolOutputs,
                        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                        status: 'failed',
                        error: { code: 'provider_error', message },
                        metadata: body.metadata,
                    });
                    controller.enqueue(
                        encoder.encode(
                            buildResponsesStreamChunk({
                                type: 'response.done',
                                data: { response: failedResponse },
                            })
                        )
                    );
                    controller.close();
                }
            },
        });

        return {
            ok: true,
            response: new NextResponse(stream, {
                // `no-transform` and `X-Accel-Buffering: no` match /v1/chat/completions: without
                // them an intermediary is free to re-buffer the body, which would undo the
                // incremental release above before it ever reached the client.
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no',
                },
            }),
        };
    } catch (error) {
        return providerFailureResult(error, params.model);
    }
}

// ── Helpers ──

function extractCodeBlock(text: string): { code: string; language: string } | null {
    const match = text.match(/```(\w+)?\n([\s\S]*?)```/);
    if (match) {
        return {
            language: match[1] || 'text',
            code: match[2].trim(),
        };
    }
    return null;
}

function buildAnnotations(
    content: string,
    toolOutputs: ToolCallOutput[],
): Array<{ type: string; start_index: number; end_index: number; url: string; title?: string }> {
    const annotations: Array<{ type: string; start_index: number; end_index: number; url: string; title?: string }> = [];

    // Gather search results from tool outputs
    const searchResults: Array<{ title: string; url: string }> = [];
    const fileResults: Array<{ file_name: string }> = [];
    for (const to of toolOutputs) {
        if (to.type === 'web_search_call' && to.output?.results) {
            const results = to.output.results as Array<{ title: string; url: string; snippet: string }>;
            for (const r of results) {
                searchResults.push({ title: r.title, url: r.url });
            }
        }
        if (to.type === 'file_search_call' && to.output?.results) {
            const results = to.output.results as Array<{ file_name: string; content: string; score: number }>;
            for (const r of results) {
                fileResults.push({ file_name: r.file_name });
            }
        }
    }

    if (searchResults.length === 0 && fileResults.length === 0) return annotations;

    // Scan content for [N] patterns and map to web search results
    const citationRegex = /\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = citationRegex.exec(content)) !== null) {
        const idx = parseInt(match[1], 10) - 1;
        const result = searchResults[idx];
        if (result) {
            annotations.push({
                type: 'url_citation',
                start_index: match.index,
                end_index: match.index + match[0].length,
                url: result.url,
                title: result.title,
            });
        }
    }

    // Scan for [Source N] patterns and map to file search results
    const sourceRegex = /\[Source\s+(\d+)\]/gi;
    while ((match = sourceRegex.exec(content)) !== null) {
        const idx = parseInt(match[1], 10) - 1;
        const result = fileResults[idx];
        if (result) {
            annotations.push({
                type: 'url_citation',
                start_index: match.index,
                end_index: match.index + match[0].length,
                url: '',
                title: result.file_name,
            });
        }
    }

    return annotations;
}
