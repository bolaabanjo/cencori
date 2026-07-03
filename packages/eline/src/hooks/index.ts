import type { HookConfig } from "../types.js";

export function defineHook(config: HookConfig): HookConfig {
  if (!config.name || !config.event || !config.handler) {
    throw new Error("Hook must have name, event, and handler");
  }
  return config;
}
