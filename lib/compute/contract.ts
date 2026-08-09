/**
 * Cencori Agent Runtime Contract (v2) — the protocol every deployed agent
 * speaks, regardless of framework. An adapter's runtime shim translates
 * between this and each framework's native concepts (a LangGraph interrupt, an
 * OpenAI Agents handoff, and an Arcie approval all normalize to a *suspended
 * run awaiting an action*).
 *
 * v1 (the original 5 routes) is a subset: `POST /invoke` remains as **sync
 * sugar** over `POST /runs` + awaiting the terminal event, so today's Arcie
 * server and the `<agent-chat>` widget keep working during the rollout.
 *
 * See COMPUTE_UNIVERSAL_DEPLOY.md §4.
 */

export const RUNTIME_CONTRACT_VERSION = '2.0';

/** The HTTP surface a compliant agent exposes on `$PORT`. */
export const CONTRACT_ROUTES = [
    'POST /runs',              // start a run                → { runId, state }
    'GET /runs/:id',           // run status
    'GET /runs/:id/events',    // stream run events (SSE / NDJSON)
    'POST /runs/:id/cancel',   // cancel a run
    'POST /runs/:id/resume',   // resume / approve a suspended run
    'POST /channels/:name',    // channel handler (verified webhook)
    'POST /schedules/:name',   // scheduled trigger
    'GET /_manifest',          // capabilities (the normalized manifest)
    'GET /_health',            // health / readiness
    // Legacy sugar — kept for back-compat:
    'POST /invoke',            // = POST /runs then await terminal event (sync)
] as const;

export type RunState = 'queued' | 'running' | 'suspended' | 'succeeded' | 'failed' | 'canceled';

export interface StartRunRequest {
    input: unknown;
    sessionId?: string;
    stream?: boolean;
}

export interface RunHandle {
    runId: string;
    state: RunState;
}

/** Why a run is paused — the thing the caller must act on to `resume`. */
export interface SuspendReason {
    kind: 'approval' | 'input' | 'handoff';
    callId?: string;
    prompt?: string;
    payload?: unknown;
}

/** Normalized run event stream — the union every shim emits. */
export type RunEvent =
    | { type: 'run.started'; runId: string }
    | { type: 'message.delta'; delta: string }
    | { type: 'message.completed'; text: string }
    | { type: 'reasoning.delta'; delta: string }
    | { type: 'tool.started'; callId: string; name: string; input: unknown }
    | { type: 'tool.completed'; callId: string; output: unknown; status: 'completed' | 'error' | 'rejected' }
    | { type: 'run.suspended'; runId: string; reason: SuspendReason }
    | { type: 'run.succeeded'; runId: string; output: unknown }
    | { type: 'run.failed'; runId: string; error: { code: string; message: string } }
    | { type: 'run.canceled'; runId: string };

export const TERMINAL_EVENTS: ReadonlyArray<RunEvent['type']> = [
    'run.succeeded',
    'run.failed',
    'run.canceled',
];
