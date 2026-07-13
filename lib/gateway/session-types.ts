import type { ResponsesRequest } from '@/lib/gateway/v1-responses-execute';
import type { MemoryDirectiveInput } from '@/lib/memory';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed';

export type SessionEventType =
    | 'turn.started'
    | 'output_text.delta'
    | 'tool_call.started'
    | 'tool_call.completed'
    | 'turn.paused'
    | 'turn.resumed'
    | 'turn.completed'
    | 'turn.failed'
    | 'turn.checkpoint';

export interface SessionRecord {
    id: string;
    project_id: string;
    organization_id: string;
    status: SessionStatus;
    agent_id: string | null;
    last_turn_number: number;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface SessionEventRecord {
    id: string;
    session_id: string;
    turn_number: number;
    sequence: number;
    event_type: SessionEventType;
    payload: Record<string, unknown>;
    created_at: string;
}

export interface SessionEventPayloadMap {
    'turn.started': { turn_number: number; model: string; instructions?: string; input_text?: string; input_messages?: Array<{ role: string; content: string | null }> };
    'output_text.delta': { delta: string; index?: number };
    'tool_call.started': { tool: string; arguments: Record<string, unknown>; action_id?: string };
    'tool_call.completed': { tool: string; output: unknown; action_id?: string };
    'turn.paused': { reason: string; action_id: string; tool: string; arguments: Record<string, unknown> };
    'turn.resumed': { action_id: string; resolution: 'approved' | 'rejected' };
    'turn.completed': { turn_number: number; output?: unknown; usage?: { input_tokens: number; output_tokens: number; total_tokens: number } };
    'turn.failed': { turn_number: number; output: { error: string }; usage: { input_tokens: number; output_tokens: number; total_tokens: number } };
    'turn.checkpoint': { turn_number: number; messages: Array<{ role: string; content: string | null }> };
}

export interface TurnRequestBody {
    input: ResponsesRequest['input'];
    tools?: ResponsesRequest['tools'];
    instructions?: string;
    agent_id?: string;
    model?: string;
    temperature?: number;
    max_output_tokens?: number;
    top_p?: number;
    tool_choice?: ResponsesRequest['tool_choice'];
    response_format?: ResponsesRequest['response_format'];
    store?: boolean;
    metadata?: Record<string, string>;
    user?: string;
    stream?: boolean;
    parallel_tool_calls?: boolean;
    truncation?: 'auto' | 'disabled';
    pause_on_tool_calls?: boolean;
    /** Gateway memory directive — presence opts the turn into memory (retrieve + write). */
    memory?: MemoryDirectiveInput;
}

export interface SessionResponse {
    id: string;
    status: SessionStatus;
    turn_count: number;
    created_at: string;
    updated_at: string;
    agent_id: string | null;
    metadata: Record<string, unknown>;
    total_cost?: number;
}

export interface CreateSessionRequest {
    agent_id?: string;
    metadata?: Record<string, unknown>;
}

export interface SSESessionEvent<T extends SessionEventType = SessionEventType> {
    event: T;
    data: SessionEventPayloadMap[T];
}
