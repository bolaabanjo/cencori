import type { AgentConfig } from "../types.js";

export function defineAgent(config: AgentConfig): AgentConfig {
  if (!config.model) {
    throw new Error("Agent must specify a model");
  }
  return config;
}
