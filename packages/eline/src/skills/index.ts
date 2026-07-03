import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SkillConfig } from "../types.js";

export function defineSkill(config: SkillConfig): SkillConfig {
  if (!config.name || !config.content) {
    throw new Error("Skill must have a name and content");
  }
  return config;
}

export function getSkill(
  agentDir: string,
  name: string
): SkillConfig | null {
  const mdPath = resolve(agentDir, "knowledge", `${name}.md`);
  const tsPath = resolve(agentDir, "knowledge", `${name}.ts`);

  if (existsSync(mdPath)) {
    return {
      name,
      description: "",
      content: readFileSync(mdPath, "utf-8"),
    };
  }
  if (existsSync(tsPath)) {
    return {
      name,
      description: "",
      content: readFileSync(tsPath, "utf-8"),
    };
  }
  return null;
}
