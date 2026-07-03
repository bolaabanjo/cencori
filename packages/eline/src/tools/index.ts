import type { ToolConfig } from "../types.js";

export function defineTool<TInput = unknown, TOutput = unknown>(
  config: ToolConfig<TInput, TOutput>
): ToolConfig<TInput, TOutput> {
  if (!config.description) {
    throw new Error("Tool must have a description");
  }
  if (!config.execute) {
    throw new Error("Tool must have an execute function");
  }
  return config;
}
