import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { InstructionsConfig } from "../types.js";

export function defineInstructions(
  source: string | InstructionsConfig
): InstructionsConfig {
  if (typeof source === "string") {
    const filePath = resolve(process.cwd(), source);
    if (!existsSync(filePath)) {
      throw new Error(`Instructions file not found: ${filePath}`);
    }
    return {
      content: readFileSync(filePath, "utf-8"),
      filePath,
    };
  }
  return source;
}

export function loadInstructions(
  agentDir: string
): InstructionsConfig | null {
  const mdPath = resolve(agentDir, "instructions.md");
  const tsPath = resolve(agentDir, "instructions.ts");

  if (existsSync(mdPath)) {
    return {
      content: readFileSync(mdPath, "utf-8"),
      filePath: mdPath,
    };
  }
  if (existsSync(tsPath)) {
    return {
      content: readFileSync(tsPath, "utf-8"),
      filePath: tsPath,
    };
  }
  return null;
}
