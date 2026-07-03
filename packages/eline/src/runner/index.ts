import { loadAgent, type LoadedAgent } from "../loader.js";
import { discoverAgent } from "../discover/index.js";
import type { TurnContext, ToolCallContext } from "../types.js";
import {
  createSessionStarted, createTurnStarted, createMessageReceived,
  createMessageAppended, createMessageCompleted, createStepStarted,
  createStepCompleted, createSessionWaiting, createSessionCompleted,
  createTurnCompleted,
  type StreamEvent,
} from "../protocol/events.js";

export interface RunOptions {
  endpoint?: string;
  apiKey?: string;
  maxTurns?: number;
  onEvent?: (event: StreamEvent) => void;
}

export interface RunResult {
  output: string;
  turns: TurnContext[];
  events: StreamEvent[];
}

export async function runAgent(
  agentDir: string,
  input: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const agent = await loadAgent(agentDir);
  const endpoint = options.endpoint || process.env.CENCORI_API_URL || "https://cencori.com/v1";
  const apiKey = options.apiKey || process.env.CENCORI_API_KEY || "";
  const events: StreamEvent[] = [];
  const sessionId = crypto.randomUUID();
  const turnId = crypto.randomUUID();

  const emit = (event: StreamEvent) => {
    events.push(event);
    options.onEvent?.(event);
  };

  const model = agent.manifest.config.model;
  const instructions = agent.manifest.instructions;
  const tools = Object.entries(agent.manifest.tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema ? {} : undefined,
  }));

  emit(createSessionStarted(sessionId, {
    agentId: agent.manifest.config.name ?? "unnamed",
    modelId: model,
    elineVersion: "0.1.2",
  }));

  emit(createTurnStarted(1, turnId));
  emit(createMessageReceived(input, 1, turnId));

  const response = await fetch(`${endpoint}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(agent.manifest.config.cencori?.project
        ? { "X-Project-ID": agent.manifest.config.cencori.project }
        : {}),
    },
    body: JSON.stringify({
      model,
      input,
      instructions,
      tools: tools.length > 0 ? tools : undefined,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    emit(createTurnCompleted(1, turnId));
    emit(createSessionCompleted());
    throw new Error(`Cencori API error (${response.status}): ${error}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const outputText = typeof data.output_text === "string" ? data.output_text : JSON.stringify(data);

  emit(createStepCompleted("stop", 1, 0, turnId));
  emit(createMessageCompleted(outputText, "stop", 1, 0, turnId));
  emit(createTurnCompleted(1, turnId));
  emit(createSessionWaiting());

  const turn: TurnContext = {
    id: turnId,
    sessionId,
    input,
    output: outputText,
  };

  return {
    output: outputText,
    turns: [turn],
    events,
  };
}

export async function* streamAgent(
  agentDir: string,
  input: string,
  options: RunOptions = {}
): AsyncGenerator<StreamEvent, void, unknown> {
  const agent = await loadAgent(agentDir);
  const endpoint = options.endpoint || process.env.CENCORI_API_URL || "https://cencori.com/v1";
  const apiKey = options.apiKey || process.env.CENCORI_API_KEY || "";
  const sessionId = crypto.randomUUID();
  const turnId = crypto.randomUUID();

  const model = agent.manifest.config.model;
  const instructions = agent.manifest.instructions;
  const tools = Object.entries(agent.manifest.tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema ? {} : undefined,
  }));

  yield createSessionStarted(sessionId, {
    agentId: agent.manifest.config.name ?? "unnamed",
    modelId: model,
    elineVersion: "0.1.2",
  });

  yield createTurnStarted(1, turnId);
  yield createMessageReceived(input, 1, turnId);
  yield createStepStarted(1, 0, turnId);

  const response = await fetch(`${endpoint}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      instructions,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    yield createTurnCompleted(1, turnId);
    yield createSessionCompleted();
    throw new Error(`Cencori API error (${response.status}): ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  let textSoFar = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === "text" && parsed.delta) {
            textSoFar += parsed.delta;
            yield createMessageAppended(parsed.delta, textSoFar, 1, 0, turnId);
          }
        } catch {}
      }
    }
  }

  yield createMessageCompleted(textSoFar || null, "stop", 1, 0, turnId);
  yield createStepCompleted("stop", 1, 0, turnId);
  yield createTurnCompleted(1, turnId);
  yield createSessionWaiting();
}
