export type AssistantStepFinishReason =
  | "content-filter"
  | "error"
  | "length"
  | "other"
  | "stop"
  | "tool-calls";

export type ActionResultStatus = "completed" | "failed" | "rejected";

export interface ActionResultError {
  readonly code: string;
  readonly message: string;
}

export interface SessionStartedEvent {
  type: "session.started";
  data: {
    sessionId: string;
    runtime?: { agentId: string; modelId: string; elineVersion: string };
  };
}

export interface TurnStartedEvent {
  type: "turn.started";
  data: { sequence: number; turnId: string };
}

export interface MessageReceivedEvent {
  type: "message.received";
  data: { message: string; sequence: number; turnId: string };
}

export interface MessageAppendedEvent {
  type: "message.appended";
  data: { delta: string; textSoFar: string; sequence: number; stepIndex: number; turnId: string };
}

export interface MessageCompletedEvent {
  type: "message.completed";
  data: { text: string | null; finishReason: AssistantStepFinishReason; sequence: number; stepIndex: number; turnId: string };
}

export interface ReasoningAppendedEvent {
  type: "reasoning.appended";
  data: { delta: string; soFar: string; sequence: number; stepIndex: number; turnId: string };
}

export interface ReasoningCompletedEvent {
  type: "reasoning.completed";
  data: { text: string; sequence: number; stepIndex: number; turnId: string };
}

export interface StepStartedEvent {
  type: "step.started";
  data: { sequence: number; stepIndex: number; turnId: string };
}

export interface StepCompletedEvent {
  type: "step.completed";
  data: { finishReason: AssistantStepFinishReason; sequence: number; stepIndex: number; turnId: string; usage?: { inputTokens?: number; outputTokens?: number } };
}

export interface StepFailedEvent {
  type: "step.failed";
  data: { code: string; message: string; sequence: number; stepIndex: number; turnId: string };
}

export interface ToolCallStartedEvent {
  type: "tool.started";
  data: { name: string; input: unknown; callId: string; sequence: number; stepIndex: number; turnId: string };
}

export interface ToolCallCompletedEvent {
  type: "tool.completed";
  data: { name: string; output: unknown; callId: string; status: ActionResultStatus; error?: ActionResultError; sequence: number; stepIndex: number; turnId: string };
}

export interface TurnCompletedEvent {
  type: "turn.completed";
  data: { sequence: number; turnId: string };
}

export interface TurnFailedEvent {
  type: "turn.failed";
  data: { code: string; message: string; sequence: number; turnId: string };
}

export interface SessionWaitingEvent {
  type: "session.waiting";
  data: { wait: "next-user-message" };
}

export interface SessionCompletedEvent {
  type: "session.completed";
}

export interface SessionFailedEvent {
  type: "session.failed";
  data: { code: string; message: string; sessionId: string };
}

export interface SubagentCalledEvent {
  type: "subagent.called";
  data: { name: string; callId: string; childSessionId: string; turnId: string };
}

export interface SubagentCompletedEvent {
  type: "subagent.completed";
  data: { name: string; callId: string; output: string };
}

export type StreamEvent =
  | SessionStartedEvent
  | TurnStartedEvent
  | MessageReceivedEvent
  | MessageAppendedEvent
  | MessageCompletedEvent
  | ReasoningAppendedEvent
  | ReasoningCompletedEvent
  | StepStartedEvent
  | StepCompletedEvent
  | StepFailedEvent
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | SessionWaitingEvent
  | SessionCompletedEvent
  | SessionFailedEvent
  | SubagentCalledEvent
  | SubagentCompletedEvent;

export function createSessionStarted(sessionId: string, runtime?: SessionStartedEvent["data"]["runtime"]): SessionStartedEvent {
  return { type: "session.started", data: { sessionId, ...(runtime ? { runtime } : {}) } };
}

export function createTurnStarted(sequence: number, turnId: string): TurnStartedEvent {
  return { type: "turn.started", data: { sequence, turnId } };
}

export function createMessageReceived(message: string, sequence: number, turnId: string): MessageReceivedEvent {
  return { type: "message.received", data: { message, sequence, turnId } };
}

export function createMessageAppended(delta: string, textSoFar: string, sequence: number, stepIndex: number, turnId: string): MessageAppendedEvent {
  return { type: "message.appended", data: { delta, textSoFar, sequence, stepIndex, turnId } };
}

export function createMessageCompleted(text: string | null, finishReason: AssistantStepFinishReason, sequence: number, stepIndex: number, turnId: string): MessageCompletedEvent {
  return { type: "message.completed", data: { text, finishReason, sequence, stepIndex, turnId } };
}

export function createStepStarted(sequence: number, stepIndex: number, turnId: string): StepStartedEvent {
  return { type: "step.started", data: { sequence, stepIndex, turnId } };
}

export function createStepCompleted(finishReason: AssistantStepFinishReason, sequence: number, stepIndex: number, turnId: string, usage?: StepCompletedEvent["data"]["usage"]): StepCompletedEvent {
  return { type: "step.completed", data: { finishReason, sequence, stepIndex, turnId, usage } };
}

export function createTurnCompleted(sequence: number, turnId: string): TurnCompletedEvent {
  return { type: "turn.completed", data: { sequence, turnId } };
}

export function createSessionWaiting(): SessionWaitingEvent {
  return { type: "session.waiting", data: { wait: "next-user-message" } };
}

export function createSessionCompleted(): SessionCompletedEvent {
  return { type: "session.completed" };
}

export function encodeEvent(event: StreamEvent): string {
  return JSON.stringify(event) + "\n";
}

export function encodeEvents(events: StreamEvent[]): string {
  return events.map(encodeEvent).join("");
}
