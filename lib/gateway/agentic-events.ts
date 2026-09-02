/**
 * The timeline of a turn on /v1/responses.
 *
 * `ai_requests` records one row per call: the masked prompt, the response, the tool calls, the
 * cost. That answers "what was this request", and it is the wrong shape for "what did this agent
 * do" — an agent task is a dozen calls, and the row says nothing about their order or how long any
 * step took. `session_events` is that log, and it was reachable only from /v1/sessions because it
 * required a session row. The migration alongside this file makes `session_id` optional, so the
 * stateless endpoint can write a timeline without inventing a session for every request.
 *
 * Content is deliberately absent. Arguments and output are already in `ai_requests`, masked by the
 * project's custom data rules; writing them here too would mean a second copy of the most
 * sensitive text in the system, and a second masking path to keep in step with the first. What is
 * recorded is the shape of the turn: which tools were offered, which were called, which results
 * came back, in what order, and — from the timestamps — how long each took.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { SessionEventType } from '@/lib/gateway/session-types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Not a session turn number. A stateless run has no turn counter: its calls are chained by
 * `previous_response_id`, and ordered by `created_at` then `sequence`. Zero marks the rows where
 * that is the case, and keeps the NOT NULL column honest rather than inventing a count.
 */
const STATELESS_TURN = 0;

export type ResponseTurnEvents = {
    supabase: SupabaseAdmin;
    projectId: string;
    organizationId: string;
    responseId: string;
    previousResponseId?: string;
    model: string;
    /** Tools the model was given. A turn that called nothing means something different with none. */
    toolsOffered: string[];
    /** Calls the model made on this request, including any recovered from XML markup. */
    toolCalls: Array<{ name: string; arguments: string; id?: string }>;
    /** Results that arrived with this request, completing calls made on the previous one. */
    toolResults: Array<{ callId: string; outputBytes: number }>;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export function buildResponseTurnEvents(
    params: ResponseTurnEvents
): Array<{ event_type: SessionEventType; payload: Record<string, unknown> }> {
    return [
        {
            event_type: 'turn.started',
            payload: {
                turn_number: STATELESS_TURN,
                model: params.model,
                ...(params.toolsOffered.length > 0 ? { tools_offered: params.toolsOffered } : {}),
            },
        },
        // Results first: they complete calls the model made on the previous request, so they are
        // the earliest thing to happen in this one.
        ...params.toolResults.map((result) => ({
            event_type: 'tool_call.completed' as const,
            payload: { call_id: result.callId, output_bytes: result.outputBytes },
        })),
        ...params.toolCalls.map((call) => ({
            event_type: 'tool_call.started' as const,
            payload: {
                tool: call.name,
                arguments_bytes: call.arguments.length,
                ...(call.id ? { call_id: call.id } : {}),
            },
        })),
        {
            event_type: 'turn.completed',
            payload: {
                turn_number: STATELESS_TURN,
                usage: {
                    input_tokens: params.usage.promptTokens,
                    output_tokens: params.usage.completionTokens,
                    total_tokens: params.usage.totalTokens,
                },
            },
        },
    ];
}

/**
 * Write the turn's timeline. Never throws: observability that can fail a request is worse than no
 * observability, and the caller is already inside `waitUntil` with the response long since sent.
 */
export async function recordResponseTurnEvents(params: ResponseTurnEvents): Promise<void> {
    try {
        const rows = buildResponseTurnEvents(params).map((event, sequence) => ({
            session_id: null,
            project_id: params.projectId,
            organization_id: params.organizationId,
            response_id: params.responseId,
            previous_response_id: params.previousResponseId ?? null,
            turn_number: STATELESS_TURN,
            sequence,
            event_type: event.event_type,
            payload: event.payload,
        }));
        const { error } = await params.supabase.from('session_events').insert(rows);
        if (error) {
            console.error('[Gateway] agentic event log failed:', error.message);
        }
    } catch (err) {
        console.error('[Gateway] agentic event log failed:', err);
    }
}

/**
 * Tool results carried by this request, which completed calls made on the previous one.
 *
 * The gateway does not run the tools — the client does, between two requests — so a call's
 * completion is only ever observable as the result arriving on the next call. That is also what
 * makes the duration meaningful: the gap between the `tool_call.started` row and this one is how
 * long the tool actually took on the caller's machine.
 */
export function toolResultsIn(
    input: unknown
): Array<{ callId: string; outputBytes: number }> {
    if (!Array.isArray(input)) return [];
    return input.flatMap((item) => {
        const entry = item as { type?: string; call_id?: string; output?: unknown };
        if (entry?.type !== 'function_call_output' || !entry.call_id) return [];
        const output = typeof entry.output === 'string' ? entry.output : JSON.stringify(entry.output ?? '');
        return [{ callId: entry.call_id, outputBytes: output.length }];
    });
}
