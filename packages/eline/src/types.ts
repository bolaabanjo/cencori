import type { z } from "zod";

export interface CencoriConfig {
  project?: string;
  apiKey?: string;
  billing?: {
    budget?: string;
    endUserMarkup?: number;
  };
  security?: {
    policy?: "strict" | "standard" | "permissive";
  };
}

export interface AgentConfig {
  model: string;
  name?: string;
  description?: string;
  cencori?: CencoriConfig;
}

export interface ToolConfig<TInput = unknown, TOutput = unknown> {
  name?: string;
  description: string;
  inputSchema?: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  sandbox?: boolean;
  execute: (input: TInput) => TOutput | Promise<TOutput>;
}

export interface InstructionsConfig {
  content: string;
  filePath?: string;
}

export interface SkillConfig {
  name: string;
  description: string;
  content: string;
}

export interface HookConfig {
  name: string;
  event: HookEvent;
  handler: (payload: HookPayload) => void | Promise<void>;
}

export type HookEvent =
  | "beforeTurn"
  | "afterTurn"
  | "beforeToolCall"
  | "afterToolCall"
  | "onError"
  | "onStart"
  | "onEnd";

export interface HookPayload {
  turn?: TurnContext;
  toolCall?: ToolCallContext;
  error?: Error;
}

export interface TurnContext {
  id: string;
  sessionId?: string;
  input: string;
  output?: string;
  toolCalls?: ToolCallContext[];
}

export interface ToolCallContext {
  tool: string;
  input: unknown;
  output?: unknown;
  durationMs?: number;
  error?: Error;
}

export interface ChannelConfig {
  name: string;
  type: "http" | "slack" | "discord" | "custom";
  handler: (request: ChannelRequest) => ChannelResponse | Promise<ChannelResponse>;
}

export interface ChannelRequest {
  body: unknown;
  headers: Record<string, string>;
  method: string;
}

export interface ChannelResponse {
  status: number;
  body: unknown;
}

export interface ScheduleConfig {
  name: string;
  cron: string;
  handler: () => void | Promise<void>;
  timezone?: string;
}

export interface SessionConfig {
  maxTurns?: number;
  idleTimeoutMs?: number;
  requireApproval?: boolean;
  memory?: {
    strategy: "lastN" | "summary" | "keyFacts";
    limit?: number;
  };
}

export interface PolicyConfig {
  inputGuards?: string[];
  outputGuards?: string[];
  allowedModels?: string[];
  blockedTools?: string[];
  budget?: {
    maxSpendPerSession?: string;
    maxSpendPerDay?: string;
    maxSpendPerMonth?: string;
  };
}

export interface AgentManifest {
  config: AgentConfig;
  instructions: string;
  tools: Record<string, ToolConfig>;
  skills: Record<string, SkillConfig>;
  hooks: Record<string, HookConfig>;
  channels: Record<string, ChannelConfig>;
  schedules: Record<string, ScheduleConfig>;
  session?: SessionConfig;
  policy?: PolicyConfig;
}

export interface Session {
  id: string;
  created: Date;
  turns: TurnContext[];
  metadata: Record<string, unknown>;
}
