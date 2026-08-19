import { NextResponse } from 'next/server';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { GatewayContext } from '@/lib/gateway-middleware';
import type { SubscriptionTier } from '@/lib/entitlements';
import { streamGatewayChat } from '@/lib/gateway/chat-executor';
import {
    resolveGatewayProvider,
    type ResolvedGatewayProvider,
} from '@/lib/gateway/providers-setup';
import {
    preProcessBuiltInTools,
    type ResponsesBuiltInTool,
    type ToolCallOutput,
} from '@/lib/gateway/v1-responses-tools';
import type { ResponsesTool } from '@/lib/gateway/v1-responses-execute';
import {
    type TokenUsage,
    type Tool,
    type UnifiedMessage,
} from '@/lib/providers/base';
import { settleStreamUsage } from '@/lib/gateway/stream-usage';
import type { SessionEventType, SessionEventPayloadMap } from '@/lib/gateway/session-types';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import { recordSessionApprovalRequested } from '@/lib/governance/record-session';
import { applyPolicyRedactions } from '@/lib/governance/policy-enforcement';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import type { SecurityCheckResult } from '@/lib/safety/multi-layer-check';
import { calculateGatewayCharge } from '@/lib/gateway/model-access';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;
export type { SupabaseAdmin };

export type TurnExecuteParams = {
    supabase: SupabaseAdmin;
    gatewayCtx: GatewayContext;
    sessionId: string;
    turnNumber: number;
    model: string;
    instructions?: string;
    tools?: ResponsesTool[];
    tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
    temperature?: number;
    max_output_tokens?: number;
    response_format?: { type: 'text' } | { type: 'json_object' } | { type: 'json_schema'; json_schema: { name: string; description?: string; schema: Record<string, unknown>; strict?: boolean } };
    inputMessages: UnifiedMessage[];
    inputText: string;
    inputSecurity?: SecurityCheckResult;
    tokenMap?: Map<string, string>;
    pauseOnToolCalls?: boolean;
    endUserId: string | null;
    tier: SubscriptionTier;
    logSuccess: (meta: {
        provider: string; model: string; status: 'success' | 'success_fallback' | 'error';
        promptTokens: number; completionTokens: number; totalTokens: number;
        providerCostUsd: number; cencoriChargeUsd: number; markupPercentage: number;
        errorMessage?: string;
        /** Assistant text, so the logged turn is inspectable in the console. */
        responseText?: string;
    }) => void;
    incrementUsage: (chargeUsd: number) => void;
    recordEndUserUsage?: (usage: {
        promptTokens: number; completionTokens: number; totalTokens: number;
        providerCostUsd: number; cencoriChargeUsd: number; markupPercentage: number;
    }) => void;
    /**
     * Called once with the assistant's full text after a turn completes
     * successfully (not on pause/failure). The turns route uses this to
     * schedule gateway memory writeback via waitUntil.
     */
    onCompletion?: (fullText: string) => void;
};

export type TurnExecuteResult =
    | { ok: true; response: NextResponse }
    | { ok: false; status: number; body: Record<string, unknown> };

async function appendSessionEvent(
    supabase: SupabaseAdmin, sessionId: string, turnNumber: number,
    sequence: number, eventType: SessionEventType, payload: Record<string, unknown>,
): Promise<void> {
    const result = await supabase.from('session_events').insert({
        session_id: sessionId, turn_number: turnNumber, sequence,
        event_type: eventType, payload,
    });
    if (result?.error) {
        throw new Error(`Failed to append session event ${eventType}: ${result.error.message}`);
    }
}

async function finalizeSessionTurn(
    supabase: SupabaseAdmin,
    projectId: string,
    sessionId: string,
    turnNumber: number,
    sequence: number,
    eventType: 'turn.paused' | 'turn.completed' | 'turn.failed',
    payload: Record<string, unknown>,
    status: 'active' | 'paused' | 'completed' | 'failed',
    costUsd: number,
): Promise<void> {
    const result = await supabase.rpc('finalize_session_turn', {
        p_session_id: sessionId,
        p_project_id: projectId,
        p_turn_number: turnNumber,
        p_sequence: sequence,
        p_event_type: eventType,
        p_payload: payload,
        p_status: status,
        p_cost: costUsd,
    });
    if (result?.error) {
        throw new Error(`Failed to finalize session turn: ${result.error.message}`);
    }
}

export async function expireStaleSessions(supabase: SupabaseAdmin): Promise<void> {
    try {
        const result = await supabase
            .from('sessions')
            .update({ status: 'completed', expires_at: null })
            .eq('status', 'paused')
            .lt('expires_at', new Date().toISOString());
        if (result?.error) throw new Error(result.error.message);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to expire stale sessions: ${message}`);
    }
}

function buildSSE(eventType: string, data: Record<string, unknown>): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

function extractTools(tools?: ResponsesTool[]) {
    const functionTools: Tool[] = [];
    const builtInTools: ResponsesBuiltInTool[] = [];
    if (!tools) return { functionTools, builtInTools };
    for (const t of tools) {
        if (t.type === 'function') functionTools.push(t as Tool);
        else builtInTools.push(t as ResponsesBuiltInTool);
    }
    return { functionTools, builtInTools };
}

function resolveToolChoice(
    forceSchema: boolean, schemaName: string | null,
    choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string },
): 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } } | undefined {
    if (forceSchema && schemaName) return { type: 'function', function: { name: schemaName } };
    if (choice === 'none' || choice === 'required') return choice;
    if (choice && typeof choice === 'object' && 'name' in choice) {
        return { type: 'function', function: { name: (choice as { name: string }).name } };
    }
    return undefined;
}

function makeStream(params: {
    supabase: SupabaseAdmin; gatewayCtx: GatewayContext;
    sessionId: string; turnNumber: number;
    resolved: ResolvedGatewayProvider;
    messages: UnifiedMessage[]; functionTools: Tool[];
    forceSchemaResult: boolean; schemaToolName: string | null;
    tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
    temperature?: number; max_output_tokens?: number;
    pauseOnToolCalls: boolean;
    needsApprovalToolNames: Set<string>;
    collectedBuiltinToolOutputs: ToolCallOutput[];
    instructions?: string;
    inputText?: string;
    inputSecurity?: SecurityCheckResult;
    tokenMap?: Map<string, string>;
    endUserId?: string | null;
    tier: SubscriptionTier;
    logSuccess: (m: { provider: string; model: string; status: 'success' | 'success_fallback' | 'error'; promptTokens: number; completionTokens: number; totalTokens: number; providerCostUsd: number; cencoriChargeUsd: number; markupPercentage: number; errorMessage?: string; responseText?: string }) => void;
    incrementUsage: (c: number) => void;
    recordEndUserUsage?: (u: { promptTokens: number; completionTokens: number; totalTokens: number; providerCostUsd: number; cencoriChargeUsd: number; markupPercentage: number }) => void;
    onCompletion?: (fullText: string) => void;
}): NextResponse {
    const {
        supabase, gatewayCtx, sessionId, turnNumber, resolved,
        messages, functionTools, forceSchemaResult, schemaToolName, tool_choice,
        temperature, max_output_tokens, pauseOnToolCalls, needsApprovalToolNames, collectedBuiltinToolOutputs,
        instructions, inputText, inputSecurity, tokenMap, endUserId,
        tier, logSuccess, incrementUsage, recordEndUserUsage, onCompletion,
    } = params;

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            let seq = 0;
            let fullText = '';
            // Real usage from the provider when the adapter reports it.
            let reportedUsage: TokenUsage | undefined;
            const toolCalls: Record<string, { id: string; name: string; args: string }> = {};

            const el = async (eventType: SessionEventType, data: SessionEventPayloadMap[typeof eventType]) => {
                seq++;
                await appendSessionEvent(supabase, sessionId, turnNumber, seq, eventType, data as Record<string, unknown>);
                controller.enqueue(encoder.encode(buildSSE(eventType, data as Record<string, unknown>)));
            };
            const terminal = async (
                eventType: 'turn.paused' | 'turn.completed' | 'turn.failed',
                data: Record<string, unknown>,
                status: 'active' | 'paused' | 'completed' | 'failed',
                costUsd: number,
            ) => {
                seq++;
                await finalizeSessionTurn(
                    supabase,
                    gatewayCtx.projectId,
                    sessionId,
                    turnNumber,
                    seq,
                    eventType,
                    data,
                    status,
                    costUsd,
                );
                controller.enqueue(encoder.encode(buildSSE(eventType, data)));
            };

            try {
                await el('turn.started', {
                    turn_number: turnNumber,
                    model: resolved.model,
                    instructions,
                    input_text: inputText,
                    input_messages: messages.map(m => ({ role: m.role, content: m.content ?? null })),
                    input_security: inputSecurity,
                    input_token_map: tokenMap ? Object.fromEntries(tokenMap) : undefined,
                });

                for await (const chunk of streamGatewayChat({
                    supabase, projectId: gatewayCtx.projectId,
                    organizationId: gatewayCtx.organizationId,
                    allowedModels: gatewayCtx.allowedModels, sponsoredModels: gatewayCtx.sponsoredModels, tier,
                    request: {
                        messages, model: resolved.model,
                        temperature, maxTokens: max_output_tokens, stream: true,
                        tools: functionTools.length > 0 ? functionTools : undefined,
                        toolChoice: resolveToolChoice(forceSchemaResult, schemaToolName, tool_choice),
                    },
                    resolved: resolved as never,
                    requestId: gatewayCtx.requestId,
                    })) {
                        if (chunk.usage) {
                            reportedUsage = chunk.usage;
                        }
                        if (chunk.delta) {
                            fullText += chunk.delta;
                        }
                    if (chunk.toolCalls) {
                        for (const tc of chunk.toolCalls) {
                            const k = tc.id || 'unknown';
                            if (!toolCalls[k]) toolCalls[k] = { id: k, name: '', args: '' };
                            if (tc.function?.name) toolCalls[k].name = tc.function.name;
                            if (tc.function?.arguments) toolCalls[k].args += tc.function.arguments;
                        }
                    }
                    if (chunk.finishReason) {
                        if (forceSchemaResult && schemaToolName) {
                            const sc = Object.values(toolCalls).find(t => t.name === schemaToolName);
                            if (sc?.args) fullText = sc.args;
                        }

                        const callValues = Object.values(toolCalls).filter(
                            t => !(forceSchemaResult && schemaToolName && t.name === schemaToolName),
                        );

                        fullText = tokenMap ? deTokenize(fullText, tokenMap) : fullText;
                        for (const toolCall of callValues) {
                            if (tokenMap) toolCall.args = deTokenize(toolCall.args, tokenMap);
                        }

                        const safeInputSecurity = inputSecurity ?? {
                            safe: true,
                            reasons: [],
                            layer: 'input',
                            riskScore: 0,
                            confidence: 1,
                        };
                        const outputCheck = await runGatewayOutputGuard({
                            supabase,
                            projectId: gatewayCtx.projectId,
                            apiKeyId: gatewayCtx.apiKeyId,
                            environment: gatewayCtx.environment,
                            outputText: [fullText, ...callValues.map(tc => tc.args)].filter(Boolean).join('\n'),
                            inputText: inputText ?? '',
                            inputSecurity: safeInputSecurity,
                            conversationHistory: messages,
                            endUserId,
                            organizationId: gatewayCtx.organizationId,
                            model: resolved.model,
                            region: gatewayCtx.countryCode,
                        });

                        const streamProvider =
                            chunk.actualProvider !== resolved.providerName
                            && resolved.router?.hasProvider(chunk.actualProvider)
                                ? resolved.router.getProvider(chunk.actualProvider)
                                : resolved.provider;
                        const pricing = await streamProvider.getPricing(chunk.actualModel);
                        const settled = await settleStreamUsage({
                            reported: reportedUsage,
                            pricing,
                            estimate: async () => {
                                const promptText = messages.map(m => m.content || '').join(' ');
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
                        const pt = settled.promptTokens;
                        const ct = settled.completionTokens;
                        const tt = settled.totalTokens;
                        const pc = settled.providerCostUsd;
                        const { cencoriChargeUsd: cc, markupPercentage } = calculateGatewayCharge(
                            pc,
                            pricing,
                            chunk.billingMode,
                        );
                        const pn = resolved.customProviderTag || chunk.actualProvider;

                        if (!outputCheck.ok) {
                            await terminal('turn.failed', {
                                turn_number: turnNumber,
                                output: { error: outputCheck.message },
                                usage: { input_tokens: pt, output_tokens: ct, total_tokens: tt },
                            }, 'active', cc);
                            logSuccess({
                                provider: pn,
                                model: chunk.actualModel,
                                status: 'error',
                                promptTokens: pt,
                                completionTokens: ct,
                                totalTokens: tt,
                                providerCostUsd: pc,
                                cencoriChargeUsd: cc,
                                markupPercentage,
                                errorMessage: outputCheck.message,
                            });
                            incrementUsage(cc);
                            if (recordEndUserUsage) recordEndUserUsage({ promptTokens: pt, completionTokens: ct, totalTokens: tt, providerCostUsd: pc, cencoriChargeUsd: cc, markupPercentage });
                            controller.close();
                            return;
                        }

                        // Apply policy output redactions before the (buffered) emit.
                        if (outputCheck.redactions?.length) {
                            fullText = applyPolicyRedactions(fullText, outputCheck.redactions).text;
                        }

                        if (fullText) {
                            await el('output_text.delta', { delta: fullText });
                        }

                        for (const tc of callValues) {
                            let args: Record<string, unknown> = {};
                            try { args = JSON.parse(tc.args); } catch {}
                            await el('tool_call.started', { tool: tc.name, arguments: args, action_id: tc.id });
                        }

                        for (const to of collectedBuiltinToolOutputs) {
                            await el('tool_call.completed', {
                                tool: to.type, output: to.output || to.error || {}, action_id: to.id,
                            });
                        }

                        // Pause if tool calls present and pause is enabled
                        if (pauseOnToolCalls && callValues.length > 0) {
                            const shouldPause = needsApprovalToolNames.size === 0
                                || callValues.some(tc => needsApprovalToolNames.has(tc.name));
                            if (shouldPause) {
                                await terminal('turn.paused', {
                                    reason: 'approval_required',
                                    action_id: callValues[0].id,
                                    tool: callValues[0].name,
                                    arguments: Object.fromEntries(callValues.map(tc => [tc.name, tc.args])),
                                    actions: callValues.map(tc => ({
                                        action_id: tc.id,
                                        tool: tc.name,
                                        arguments: tc.args,
                                    })),
                                }, 'paused', cc);
                                // Governance: an autonomous tool call is now gated on human approval.
                                void recordSessionApprovalRequested(supabase, {
                                    orgId: gatewayCtx.organizationId,
                                    projectId: gatewayCtx.projectId,
                                    sessionId,
                                    turnNumber,
                                    tool: callValues[0].name,
                                    actionIds: callValues.map(tc => tc.id),
                                    model: resolved.model,
                                });
                                logSuccess({ provider: pn, model: chunk.actualModel, status: chunk.usedFallback ? 'success_fallback' : 'success', promptTokens: pt, completionTokens: ct, totalTokens: tt, providerCostUsd: pc, cencoriChargeUsd: cc, markupPercentage, responseText: fullText });
                                incrementUsage(cc);
                                if (recordEndUserUsage) recordEndUserUsage({ promptTokens: pt, completionTokens: ct, totalTokens: tt, providerCostUsd: pc, cencoriChargeUsd: cc, markupPercentage });
                                controller.close();
                                return;
                            }
                        }

                        // Complete
                        const output = buildOutput(fullText, callValues, collectedBuiltinToolOutputs);
                        await terminal(
                            'turn.completed',
                            { turn_number: turnNumber, output, usage: { input_tokens: pt, output_tokens: ct, total_tokens: tt } },
                            'active',
                            cc,
                        );

                        logSuccess({ provider: pn, model: chunk.actualModel, status: chunk.usedFallback ? 'success_fallback' : 'success', promptTokens: pt, completionTokens: ct, totalTokens: tt, providerCostUsd: pc, cencoriChargeUsd: cc, markupPercentage, responseText: fullText });
                        incrementUsage(cc);
                        if (recordEndUserUsage) recordEndUserUsage({ promptTokens: pt, completionTokens: ct, totalTokens: tt, providerCostUsd: pc, cencoriChargeUsd: cc, markupPercentage });

                        void maybeCreateCheckpoint(supabase, sessionId, turnNumber, messages, fullText);

                        // Gateway memory writeback (async, post-redaction) — the
                        // turns route wires this to runChatMemoryWriteback.
                        onCompletion?.(fullText);

                        controller.close();
                    }
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Turn execution failed';
                try {
                    await terminal(
                        'turn.failed',
                        { turn_number: turnNumber, output: { error: msg }, usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
                        'active',
                        0,
                    );
                } catch (finalizeError) {
                    console.error('[SessionEngine] Failed to persist turn failure:', finalizeError);
                }
                logSuccess({ provider: '', model: '', status: 'error', promptTokens: 0, completionTokens: 0, totalTokens: 0, providerCostUsd: 0, cencoriChargeUsd: 0, markupPercentage: 0, errorMessage: msg });
                controller.close();
            }
        },
    });

    return new NextResponse(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
}

const SESSION_HISTORY_MAX_MESSAGES = 40;

/**
 * Rebuild prior conversation turns for a session so the model sees
 * history. Reads turn.started (user input) and turn.completed
 * (assistant output) events; the current turn's events are not yet
 * persisted when this runs, so everything returned is prior context.
 */
async function loadSessionHistory(supabase: SupabaseAdmin, sessionId: string): Promise<UnifiedMessage[]> {
    const { data: events, error } = await supabase
        .from('session_events')
        .select('event_type, payload, turn_number, sequence')
        .eq('session_id', sessionId)
        .in('event_type', ['turn.started', 'turn.completed'])
        .order('turn_number', { ascending: true })
        .order('sequence', { ascending: true });
    if (error) throw new Error(`Failed to load session history: ${error.message}`);

    const history: UnifiedMessage[] = [];
    for (const ev of events ?? []) {
        const p = ev.payload as Record<string, unknown>;
        if (ev.event_type === 'turn.started') {
            const text = p.input_text;
            if (typeof text === 'string' && text.length > 0) {
                history.push({ role: 'user', content: text });
            }
            continue;
        }
        const out = p.output as Record<string, unknown> | null | undefined;
        let text = '';
        if (typeof out?.text === 'string') {
            // Resumed turns store output as { text, tool_outputs }
            text = out.text;
        } else if (Array.isArray(out?.output)) {
            for (const item of out.output as Array<Record<string, unknown>>) {
                if (item.type !== 'message' || !Array.isArray(item.content)) continue;
                for (const c of item.content as Array<Record<string, unknown>>) {
                    if (c.type === 'output_text' && typeof c.text === 'string') text = c.text;
                }
            }
        }
        if (text) history.push({ role: 'assistant', content: text });
    }
    return history.slice(-SESSION_HISTORY_MAX_MESSAGES);
}

export async function executeSessionTurn(params: TurnExecuteParams): Promise<TurnExecuteResult> {
    const {
        supabase, gatewayCtx, sessionId, turnNumber, model,
        instructions, tools, tool_choice, temperature, max_output_tokens,
        response_format, inputMessages, inputText, inputSecurity, tokenMap,
        pauseOnToolCalls, tier, logSuccess, incrementUsage, recordEndUserUsage, onCompletion,
    } = params;

    try {
        const resolved = await resolveGatewayProvider({
            supabase, projectId: gatewayCtx.projectId, organizationId: gatewayCtx.organizationId, requestedModel: model,
            allowedModels: gatewayCtx.allowedModels, sponsoredModels: gatewayCtx.sponsoredModels,
        });

        const { functionTools, builtInTools } = extractTools(tools);
        const needsApprovalToolNames = new Set<string>();
        if (tools) {
            for (const t of tools) {
                if (t.type === 'function' && (t as Tool).needsApproval) {
                    needsApprovalToolNames.add(t.function.name);
                }
            }
        }
        const history = await loadSessionHistory(supabase, sessionId);
        const messages: UnifiedMessage[] = [...history, ...inputMessages];

        const pre = builtInTools.length > 0
            ? await preProcessBuiltInTools(inputText, builtInTools, gatewayCtx.projectId)
            : { systemContext: '', toolOutputs: [] as ToolCallOutput[] };

        if (pre.systemContext) {
            const contextPipeline = await runGatewayInputPipeline({
                supabase,
                projectId: gatewayCtx.projectId,
                apiKeyId: gatewayCtx.apiKeyId,
                environment: gatewayCtx.environment,
                tier,
                messages: [{ role: 'user', content: pre.systemContext }],
                endUserId: params.endUserId,
            });
            if (!contextPipeline.ok) {
                pre.systemContext = '';
                for (const output of pre.toolOutputs) {
                    output.status = 'failed';
                    output.error = 'Retrieved context was blocked by the project security policy';
                    delete output.output;
                }
            } else {
                pre.systemContext = contextPipeline.messages[0]?.content ?? '';
            }
        }

        if (pre.systemContext) {
            const ci = builtInTools.some(t => t.type === 'web_search_preview')
                ? '\n\nWhen citing information from search results, reference them using [N] notation where N is the result number (e.g., [1], [2]).'
                : '';
            messages.unshift({ role: 'system', content: `You have access to the following real-time information. Use it to answer the user's question naturally.${ci}\n\n${pre.systemContext}` });
        }
        if (instructions) messages.unshift({ role: 'system', content: instructions });

        let forceSchema = false;
        let schemaName: string | null = null;
        if (response_format?.type === 'json_schema') {
            schemaName = response_format.json_schema.name || 'structured_output';
            functionTools.push({ type: 'function', function: { name: schemaName, description: response_format.json_schema.description || 'Generate structured output', parameters: response_format.json_schema.schema } });
            forceSchema = true;
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

        const response = makeStream({
            supabase, gatewayCtx, sessionId, turnNumber,
            resolved: resolved as never,
            messages, functionTools, forceSchemaResult: forceSchema, schemaToolName: schemaName,
            tool_choice, temperature, max_output_tokens,
            pauseOnToolCalls: pauseOnToolCalls ?? false,
            needsApprovalToolNames,
            collectedBuiltinToolOutputs: [...pre.toolOutputs],
            instructions, inputText, inputSecurity, tokenMap, endUserId: params.endUserId,
            tier, logSuccess, incrementUsage, recordEndUserUsage, onCompletion,
        });

        return { ok: true, response };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Session engine error';
        return { ok: false, status: 500, body: { error: { message: msg, type: 'invalid_request_error', code: 'session_engine_error' }, status: 'failed' } };
    }
}

export type ResumeTurnParams = {
    supabase: SupabaseAdmin;
    gatewayCtx: GatewayContext;
    sessionId: string;
    turnNumber: number;
    toolResults: Array<{ action_id: string; output: string }>;
    tier: SubscriptionTier;
    logSuccess: TurnExecuteParams['logSuccess'];
    incrementUsage: TurnExecuteParams['incrementUsage'];
    recordEndUserUsage?: TurnExecuteParams['recordEndUserUsage'];
    inputText?: string;
    inputSecurity?: SecurityCheckResult;
    tokenMap?: Map<string, string>;
};

export async function resumeSessionTurn(params: ResumeTurnParams): Promise<TurnExecuteResult> {
    const {
        supabase, gatewayCtx, sessionId, turnNumber, toolResults,
        tier, logSuccess, incrementUsage, recordEndUserUsage,
        inputText: resumedInputText, inputSecurity: resumedInputSecurity,
        tokenMap: resumedTokenMap,
    } = params;

    try {
        const { data: events } = await supabase
            .from('session_events')
            .select('event_type, payload, sequence')
            .eq('session_id', sessionId)
            .eq('turn_number', turnNumber)
            .order('sequence', { ascending: true });

        if (!events || events.length === 0) {
            return { ok: false, status: 400, body: { error: { message: 'No events found for turn', type: 'invalid_request_error', code: 'no_events' }, status: 'failed' } };
        }

        const startedEvent = events.find(e => e.event_type === 'turn.started');
        if (!startedEvent) {
            return { ok: false, status: 400, body: { error: { message: 'Turn has no started event', type: 'invalid_request_error', code: 'no_started_event' }, status: 'failed' } };
        }

        const pausedEvent = events.find(e => e.event_type === 'turn.paused');
        if (!pausedEvent) {
            return { ok: false, status: 400, body: { error: { message: 'Turn is not paused', type: 'invalid_request_error', code: 'turn_not_paused' }, status: 'failed' } };
        }

        const sp = startedEvent.payload as Record<string, unknown>;
        const model = sp.model as string;
        const instructions = sp.instructions as string | undefined;
        const inputText = sp.input_text as string | undefined;
        const storedInputSecurity = sp.input_security as SecurityCheckResult | undefined;
        const storedTokenMap = new Map<string, string>(
            Object.entries((sp.input_token_map as Record<string, string> | undefined) ?? {})
        );
        for (const [placeholder, value] of resumedTokenMap ?? []) {
            storedTokenMap.set(placeholder, value);
        }

        if (!model) {
            return { ok: false, status: 400, body: { error: { message: 'Turn has no model', type: 'invalid_request_error', code: 'no_model' }, status: 'failed' } };
        }

        const resolved = await resolveGatewayProvider({
            supabase, projectId: gatewayCtx.projectId, organizationId: gatewayCtx.organizationId, requestedModel: model,
            allowedModels: gatewayCtx.allowedModels, sponsoredModels: gatewayCtx.sponsoredModels,
        });

        // Reconstruct assistant text and tool calls from events
        let assistantText = '';
        const toolCallEntries: Array<{ id: string; name: string; args: string }> = [];

        for (const ev of events) {
            const p = ev.payload as Record<string, unknown>;
            switch (ev.event_type) {
                case 'output_text.delta':
                    assistantText += (p.delta as string) || '';
                    break;
                case 'tool_call.started':
                    toolCallEntries.push({
                        id: (p.action_id as string) || `tc_${toolCallEntries.length}`,
                        name: p.tool as string,
                        args: JSON.stringify(p.arguments || {}),
                    });
                    break;
            }
        }

        // Restore original input messages from turn.started payload
        const storedMessages = (startedEvent.payload as Record<string, unknown>).input_messages as Array<{ role: string; content: string | null }> | undefined;
        const messages: UnifiedMessage[] = storedMessages && storedMessages.length > 0
            ? storedMessages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant' | 'tool', content: m.content } as UnifiedMessage))
            : [];
        if (!storedMessages || storedMessages.length === 0) {
            if (instructions) messages.push({ role: 'system', content: instructions } as UnifiedMessage);
            const contextSummary = inputText
                ? `The user asked: "${inputText}".\n\nThe assistant processed this request and called the following functions which have now been approved and executed.`
                : 'The following function calls were approved and executed. Continue the conversation based on their results.';
            messages.push({ role: 'system', content: contextSummary } as UnifiedMessage);
        }

        // Add the assistant's tool call message
        if (toolCallEntries.length > 0) {
            messages.push({
                role: 'assistant',
                content: assistantText || null,
                tool_calls: toolCallEntries.map(tc => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: { name: tc.name, arguments: tc.args },
                })),
            } as UnifiedMessage as never);

            // Add tool results
            for (let i = 0; i < toolCallEntries.length; i++) {
                const tc = toolCallEntries[i];
                const result = toolResults.find(r => r.action_id === tc.id);
                messages.push({
                    role: 'tool' as const,
                    toolCallId: tc.id,
                    content: result?.output || JSON.stringify({ approved: true, action_id: tc.id, executed: true }),
                } as UnifiedMessage);
            }
        } else {
            // No tool calls — just the assistant text
            if (assistantText) {
                messages.push({ role: 'assistant', content: assistantText } as UnifiedMessage);
            }
            messages.push({ role: 'user', content: 'Continue.' } as UnifiedMessage);
        }

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let seq = 0;
                let fullText = '';
                // Real usage from the provider when the adapter reports it.
                let reportedUsage: TokenUsage | undefined;
                const newToolCalls: Record<string, { id: string; name: string; args: string }> = {};

                const es = async (eventType: SessionEventType, data: Record<string, unknown>) => {
                    seq++;
                    const payload = { ...data, resumed_from_turn: turnNumber };
                    await appendSessionEvent(
                        supabase,
                        sessionId,
                        turnNumber + 1,
                        seq,
                        eventType,
                        payload,
                    );
                    controller.enqueue(encoder.encode(buildSSE(eventType, payload)));
                };
                const terminal = async (
                    eventType: 'turn.completed' | 'turn.failed',
                    data: Record<string, unknown>,
                    costUsd: number,
                ) => {
                    seq++;
                    const payload = { ...data, resumed_from_turn: turnNumber };
                    await finalizeSessionTurn(
                        supabase,
                        gatewayCtx.projectId,
                        sessionId,
                        turnNumber + 1,
                        seq,
                        eventType,
                        payload,
                        'active',
                        costUsd,
                    );
                    controller.enqueue(encoder.encode(buildSSE(eventType, payload)));
                };

                try {
                    // SSE-only turn.resumed — DB insert already happened in approve route
                    controller.enqueue(encoder.encode(buildSSE('turn.resumed', {
                        action_id: toolResults[0]?.action_id || '',
                        resolution: 'approved',
                        tool_results: toolResults.map(r => ({ action_id: r.action_id })),
                        resumed_from_turn: turnNumber,
                    })));

                    for await (const chunk of streamGatewayChat({
                        supabase, projectId: gatewayCtx.projectId,
                        organizationId: gatewayCtx.organizationId,
                        allowedModels: gatewayCtx.allowedModels, sponsoredModels: gatewayCtx.sponsoredModels, tier,
                        request: {
                            messages: messages as never,
                            model: resolved.model,
                            stream: true,
                        },
                        resolved: resolved as never,
                        requestId: gatewayCtx.requestId,
                    })) {
                        if (chunk.usage) {
                            reportedUsage = chunk.usage;
                        }
                        if (chunk.delta) {
                            fullText += chunk.delta;
                        }
                        if (chunk.finishReason) {
                            fullText = storedTokenMap.size > 0
                                ? deTokenize(fullText, storedTokenMap)
                                : fullText;
                            const outputCheck = await runGatewayOutputGuard({
                                supabase,
                                projectId: gatewayCtx.projectId,
                                apiKeyId: gatewayCtx.apiKeyId,
                                environment: gatewayCtx.environment,
                                outputText: fullText,
                                inputText: [inputText, resumedInputText].filter(Boolean).join('\n'),
                                inputSecurity: resumedInputSecurity ?? storedInputSecurity ?? {
                                    safe: true,
                                    reasons: [],
                                    layer: 'input',
                                    riskScore: 0,
                                    confidence: 1,
                                },
                                conversationHistory: messages,
                                organizationId: gatewayCtx.organizationId,
                                model: resolved.model,
                                region: gatewayCtx.countryCode,
                            });
                            const streamProvider =
                                chunk.actualProvider !== resolved.providerName
                                && resolved.router?.hasProvider(chunk.actualProvider)
                                    ? resolved.router.getProvider(chunk.actualProvider)
                                    : resolved.provider;
                            const pricing = await streamProvider.getPricing(chunk.actualModel);
                            const settled = await settleStreamUsage({
                                reported: reportedUsage,
                                pricing,
                                estimate: async () => {
                                    const promptText = messages
                                        .map(m => (m as { content: string }).content || '')
                                        .join(' ');
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
                            const pt = settled.promptTokens;
                            const ct = settled.completionTokens;
                            const tt = settled.totalTokens;
                            const pc = settled.providerCostUsd;
                            const { cencoriChargeUsd: cc, markupPercentage } = calculateGatewayCharge(
                                pc,
                                pricing,
                                chunk.billingMode,
                            );

                            if (!outputCheck.ok) {
                                await terminal('turn.failed', {
                                    turn_number: turnNumber + 1,
                                    output: { error: outputCheck.message },
                                    usage: { input_tokens: pt, output_tokens: ct, total_tokens: tt },
                                }, cc);
                                const pn = resolved.customProviderTag || chunk.actualProvider;
                                logSuccess({ provider: pn, model: chunk.actualModel, status: 'error', promptTokens: pt, completionTokens: ct, totalTokens: tt, providerCostUsd: pc, cencoriChargeUsd: cc, markupPercentage, errorMessage: outputCheck.message });
                                incrementUsage(cc);
                                if (recordEndUserUsage) recordEndUserUsage({ promptTokens: pt, completionTokens: ct, totalTokens: tt, providerCostUsd: pc, cencoriChargeUsd: cc, markupPercentage });
                                controller.close();
                                return;
                            }

                            if (outputCheck.redactions?.length) {
                                fullText = applyPolicyRedactions(fullText, outputCheck.redactions).text;
                            }

                            if (fullText) await es('output_text.delta', { delta: fullText });

                            await terminal(
                                'turn.completed',
                                { turn_number: turnNumber + 1, output: { text: fullText, tool_outputs: toolResults }, usage: { input_tokens: pt, output_tokens: ct, total_tokens: tt } },
                                cc,
                            );

                            const pn = resolved.customProviderTag || chunk.actualProvider;
                            logSuccess({ provider: pn, model: chunk.actualModel, status: chunk.usedFallback ? 'success_fallback' : 'success', promptTokens: pt, completionTokens: ct, totalTokens: tt, providerCostUsd: pc, cencoriChargeUsd: cc, markupPercentage, responseText: fullText });
                            incrementUsage(cc);
                            if (recordEndUserUsage) recordEndUserUsage({ promptTokens: pt, completionTokens: ct, totalTokens: tt, providerCostUsd: pc, cencoriChargeUsd: cc, markupPercentage });

                            void maybeCreateCheckpoint(supabase, sessionId, turnNumber + 1, messages, fullText);

                            controller.close();
                        }
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Resume execution failed';
                    try {
                        await terminal(
                            'turn.failed',
                            { turn_number: turnNumber + 1, output: { error: msg }, usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
                            0,
                        );
                    } catch (eventError) {
                        console.error('[SessionEngine] Failed to persist resume failure:', eventError);
                    }
                    logSuccess({ provider: '', model: '', status: 'error', promptTokens: 0, completionTokens: 0, totalTokens: 0, providerCostUsd: 0, cencoriChargeUsd: 0, markupPercentage: 0, errorMessage: msg });
                    controller.close();
                }
            },
        });

        return { ok: true, response: new NextResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        })};

    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Session engine error';
        return { ok: false, status: 500, body: { error: { message: msg, type: 'invalid_request_error', code: 'session_engine_error' }, status: 'failed' } };
    }
}

async function maybeCreateCheckpoint(
    supabase: SupabaseAdmin, sessionId: string, turnNumber: number,
    currentMessages: UnifiedMessage[], fullText: string,
): Promise<void> {
    if (turnNumber % 50 !== 0) return;
    try {
        const { data: prevCheckpoint } = await supabase
            .from('session_events')
            .select('payload')
            .eq('session_id', sessionId)
            .eq('event_type', 'turn.checkpoint')
            .lt('turn_number', turnNumber)
            .order('turn_number', { ascending: false })
            .limit(1)
            .single();

        const prevMessages: Array<{ role: string; content: string | null }> =
            prevCheckpoint
                ? (prevCheckpoint.payload as Record<string, unknown>).messages as Array<{ role: string; content: string | null }>
                : [];

        const messages = [
            ...prevMessages,
            ...currentMessages.map(m => ({ role: m.role, content: m.content ?? null })),
        ];
        if (fullText) {
            messages.push({ role: 'assistant', content: fullText });
        }

        const result = await supabase.from('session_events').insert({
            session_id: sessionId,
            turn_number: turnNumber,
            sequence: 0,
            event_type: 'turn.checkpoint',
            payload: { turn_number: turnNumber, messages },
        });
        if (result?.error) throw new Error(result.error.message);
    } catch (e) {
        console.error(`[SessionEngine] Failed to create checkpoint at turn ${turnNumber}:`, e);
    }
}

export { maybeCreateCheckpoint };

export function buildOutput(
    text: string,
    calls: Array<{ id: string; name: string; args: string }>,
    toolOutputs: ToolCallOutput[],
): Record<string, unknown> {
    const out: Record<string, unknown>[] = [];
    if (text) {
        out.push({ id: `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] });
    }
    for (const c of calls) {
        out.push({ id: c.id, type: 'function_call', status: 'completed', call_id: c.id, name: c.name, arguments: c.args });
    }
    for (const to of toolOutputs) {
        out.push({ id: to.id, type: to.type, status: to.status, ...(to.output ? { output: to.output } : {}), ...(to.error ? { error: to.error } : {}) });
    }
    return { output: out };
}
