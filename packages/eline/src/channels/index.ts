import type { ChannelConfig } from "../types.js";

export function defineChannel(config: ChannelConfig): ChannelConfig {
  if (!config.name || !config.handler) {
    throw new Error("Channel must have name and handler");
  }
  return config;
}

export function POST(handler: ChannelConfig["handler"]): ChannelConfig["handler"] {
  return handler;
}

export function GET(handler: ChannelConfig["handler"]): ChannelConfig["handler"] {
  return handler;
}
