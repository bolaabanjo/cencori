/**
 * Responses API execution layer.
 * Translates OpenAI Responses API format ↔ Cencori internal format,
 * handles built-in tools, and formats responses.
 */

import { NextResponse } from 'next/server';
import {
    calculateProviderTokenCost,
    type UnifiedMessage,
    type Tool,
    type UnifiedChatRequest,
} from '@/lib/providers/base';
import { executeGatewayChat, streamGatewayChat } from '@/lib/gateway/chat-executor';
import { resolveGatewayProvider } from '@/lib/gateway/providers-setup';
import { mapProviderErrorToHttpResponse } from '@/lib/gateway-reliability';
import type { GatewayContext } from '@/lib/gateway-middleware';
import type { SubscriptionTier } from '@/lib/entitlements';
import type { QuotaCheckResult } from '@/lib/end-user-billing';
import type { SecurityCheckResult } from '@/lib/safety/multi-layer-check';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
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

export type ResponseInputItem =
    | { type: 'message'; role: 'user' | 'assistant' | 'system'; content: string }
    | { type: 'function_call'; id: string; call_id: string; name: string; arguments: string; status?: string }
    | { type: 'function_call_output'; call_id: string; output: string }
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
            case 'message':
                messages.push({ role: item.role, content: item.content });
                break;
            case 'function_call':
                messages.push({
                    role: 'assistant',
                    content: '',
                    toolCallId: item.call_id,
                });
                break;
            case 'function_call_output':
                messages.push({
                    role: 'tool',
                    content: item.output,
                    toolCallId: item.call_id,
                });
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
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    status?: 'completed' | 'failed';
    annotations?: Array<{ type: string; start_index: number; end_index: number; url: string; title?: string }>;
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
                text_tokens: params.usage.promptTokens,
                cached_tokens: 0,
            },
            output_tokens_details: {
                text_tokens: params.usage.completionTokens,
            },
        },
        status: params.status || 'completed',
        ...(params.metadata && Object.keys(params.metadata).length > 0 ? { metadata: params.metadata } : {}),
    };
}

function providerFailureResult(error: unknown): V1ResponseExecuteResult {
    const failure = mapProviderErrorToHttpResponse(error);
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
    type: 'response.output_text.delta' | 'response.output_text.done' | 'response.function_call_arguments.delta' | 'response.function_call_arguments.done' | 'response.web_search_call.completed' | 'response.file_search_call.completed' | 'response.code_interpreter_call.completed' | 'response.done';
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
                const collectedToolCalls: Record<string, { id: string; name: string; arguments: string }> = {};
                const collectedBuiltinToolOutputs: ToolCallOutput[] = [...preProcessResult.toolOutputs];

                try {
                    for await (const chunk of streamGatewayChat({
                        supabase: params.supabase,
                        projectId: gatewayCtx.projectId,
                        organizationId: gatewayCtx.organizationId,
                        tier,
                        request: chatRequest,
                        resolved,
                        requestId: gatewayCtx.requestId,
                    })) {
                        if (chunk.delta) {
                            fullText += chunk.delta;
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
                            });

                            const streamProvider =
                                chunk.actualProvider !== resolved.providerName
                                && resolved.router.hasProvider(chunk.actualProvider)
                                    ? resolved.router.getProvider(chunk.actualProvider)
                                    : resolved.provider;
                            let promptTokens = 0;
                            let completionTokens = 0;
                            try {
                                promptTokens = await streamProvider.countTokens(
                                    messages.map(m => m.content).join(' '),
                                    chunk.actualModel
                                );
                                completionTokens = await streamProvider.countTokens(
                                    fullText,
                                    chunk.actualModel
                                );
                            } catch {
                                promptTokens = Math.max(1, Math.ceil(messages.map(m => m.content).join(' ').length / 4));
                                completionTokens = Math.max(1, Math.ceil(fullText.length / 4));
                            }
                            const totalTokens = promptTokens + completionTokens;
                            const pricing = await streamProvider.getPricing(chunk.actualModel);
                            const providerCostUsd = calculateProviderTokenCost(
                                promptTokens,
                                completionTokens,
                                pricing
                            );
                            const cencoriChargeUsd =
                                providerCostUsd * (1 + pricing.cencoriMarkupPercentage / 100)
                                + (pricing.fixedFeePerRequest ?? 0);

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
                                    markupPercentage: pricing.cencoriMarkupPercentage,
                                    errorMessage: outputCheck.message,
                                });
                                params.incrementUsage(cencoriChargeUsd);
                                params.recordEndUserUsage({
                                    promptTokens,
                                    completionTokens,
                                    totalTokens,
                                    providerCostUsd,
                                    cencoriChargeUsd,
                                    markupPercentage: pricing.cencoriMarkupPercentage,
                                });

                                const failedResponse = buildResponsesJson({
                                    model: chunk.actualModel,
                                    content: '',
                                    toolOutputs: collectedBuiltinToolOutputs,
                                    usage: { promptTokens, completionTokens, totalTokens },
                                    status: 'failed',
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

                            // Output is buffered until the guard approves it;
                            // no unsafe prefix can escape before a later block.
                            if (fullText) {
                                controller.enqueue(
                                    encoder.encode(
                                        buildResponsesStreamChunk({
                                            type: 'response.output_text.delta',
                                            data: { delta: fullText, index: 0 },
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
                                markupPercentage: pricing.cencoriMarkupPercentage,
                            });
                            params.incrementUsage(cencoriChargeUsd);
                            params.recordEndUserUsage({
                                promptTokens,
                                completionTokens,
                                totalTokens,
                                providerCostUsd,
                                cencoriChargeUsd,
                                markupPercentage: pricing.cencoriMarkupPercentage,
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
                                usage: { promptTokens, completionTokens, totalTokens },
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
                    const message = error instanceof Error ? error.message : 'Stream failed';
                    const failedResponse = buildResponsesJson({
                        model: body.model || model,
                        content: fullText || '',
                        toolOutputs: collectedBuiltinToolOutputs,
                        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                        status: 'failed',
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
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
            }),
        };
    } catch (error) {
        return providerFailureResult(error);
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
