import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
import type {
  AgentManifest,
  AgentConfig,
  ToolConfig,
  SkillConfig,
  HookConfig,
  ChannelConfig,
  ScheduleConfig,
  SessionConfig,
  PolicyConfig,
} from "./types.js";

export interface LoadedAgent {
  manifest: AgentManifest;
  agentDir: string;
}

export async function loadAgent(agentDir: string): Promise<LoadedAgent> {
  const absDir = resolve(process.cwd(), agentDir);

  if (!existsSync(absDir)) {
    throw new Error(`Agent directory not found: ${absDir}`);
  }

  const agentFile = resolve(absDir, "agent.ts");
  let config: AgentConfig = { model: "gpt-4o" };

  if (existsSync(agentFile)) {
    try {
      const mod = await import(agentFile);
      if (mod.default) {
        config = { ...config, ...mod.default };
      }
    } catch {
      // fall back to defaults
    }
  }

  const instructions = loadInstructionsFile(absDir);
  const tools = await loadDirectory<ToolConfig>(absDir, "tools");
  const skills = await loadDirectory<SkillConfig>(absDir, "skills");
  const hooks = await loadDirectory<HookConfig>(absDir, "hooks");
  const channels = await loadDirectory<ChannelConfig>(absDir, "channels");
  const schedules = await loadDirectory<ScheduleConfig>(absDir, "schedules");
  const session = loadSessionConfig(absDir);
  const policy = loadPolicyConfig(absDir);

  return {
    agentDir: absDir,
    manifest: {
      config,
      instructions,
      tools,
      skills,
      hooks,
      channels,
      schedules,
      session: session ?? undefined,
      policy: policy ?? undefined,
    },
  };
}

function loadInstructionsFile(agentDir: string): string {
  const mdPath = resolve(agentDir, "instructions.md");
  if (existsSync(mdPath)) {
    return readFileSync(mdPath, "utf-8");
  }
  return "You are a helpful AI agent.";
}

async function loadDirectory<T>(
  agentDir: string,
  dirName: string
): Promise<Record<string, T>> {
  const dirPath = resolve(agentDir, dirName);
  if (!existsSync(dirPath)) return {};

  const entries = readdirSync(dirPath).filter(
    (f) => !f.startsWith(".") && (f.endsWith(".ts") || f.endsWith(".js"))
  );

  const result: Record<string, T> = {};

  for (const entry of entries) {
    const name = basename(entry, extname(entry));
    const filePath = resolve(dirPath, entry);

    if (statSync(filePath).isFile()) {
      try {
        const mod = await import(filePath);
        if (mod.default) {
          result[name] = mod.default;
        }
      } catch {
        // skip unloadable files
      }
    }
  }

  return result;
}

function loadSessionConfig(agentDir: string): SessionConfig | null {
  const tsPath = resolve(agentDir, "sessions", "config.ts");
  if (existsSync(tsPath)) {
    try {
      const mod = _require(tsPath);
      return mod.default ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

function loadPolicyConfig(agentDir: string): PolicyConfig | null {
  const tsPath = resolve(agentDir, "policies", "index.ts");
  if (existsSync(tsPath)) {
    try {
      const mod = _require(tsPath);
      return mod.default ?? null;
    } catch {
      return null;
    }
  }
  return null;
}
