import { readdirSync, readFileSync, existsSync, statSync, type Dirent } from "node:fs";
import { resolve, join, basename, extname, dirname } from "node:path";

export interface DiscoveredSlot {
  name: string;
  filePath: string;
  type: "markdown" | "module";
  kind: "flat" | "named";
}

export interface DiscoveredAgent {
  root: string;
  agentConfig?: string;
  instructions?: string;
  tools: DiscoveredSlot[];
  skills: DiscoveredSlot[];
  hooks: DiscoveredSlot[];
  channels: DiscoveredSlot[];
  schedules: DiscoveredSlot[];
  connections: DiscoveredSlot[];
  subagents: DiscoveredSlot[];
  lib: DiscoveredSlot[];
}

export interface DiscoverDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning";
  filePath?: string;
}

export interface DiscoverResult {
  agent: DiscoveredAgent;
  diagnostics: DiscoverDiagnostic[];
}

const TOOL_SLUG = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const CHANNEL_SLUG = /^[a-z][a-z0-9-]{0,63}$/;
const CONNECTION_SLUG = /^[a-z][a-z0-9-]{0,63}$/;
const HOOK_SLUG = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

const SUPPORTED_EXTENSIONS = new Set([".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

export function discoverAgent(agentDir: string): DiscoverResult {
  const root = resolve(agentDir);
  const diagnostics: DiscoverDiagnostic[] = [];

  if (!existsSync(root)) {
    diagnostics.push({
      code: "AGENT_DIR_NOT_FOUND",
      message: `Agent directory not found: ${root}`,
      severity: "error",
    });
    return { agent: { root, tools: [], skills: [], hooks: [], channels: [], schedules: [], connections: [], subagents: [], lib: [] }, diagnostics };
  }

  const entries = readdirSync(root, { withFileTypes: true });

  const agent = {
    root,
    agentConfig: discoverFlatModule(root, "agent", entries, diagnostics),
    instructions: discoverInstructions(root, entries, diagnostics),
    tools: discoverNamedDirectory(root, "tools", entries, TOOL_SLUG, diagnostics),
    skills: discoverNamedDirectory(root, "skills", entries, TOOL_SLUG, diagnostics),
    hooks: discoverNamedDirectory(root, "hooks", entries, HOOK_SLUG, diagnostics),
    channels: discoverNamedDirectory(root, "channels", entries, CHANNEL_SLUG, diagnostics),
    schedules: discoverNamedDirectory(root, "schedules", entries, TOOL_SLUG, diagnostics),
    connections: discoverNamedDirectory(root, "connections", entries, CONNECTION_SLUG, diagnostics),
    subagents: discoverNamedDirectory(root, "subagents", entries, TOOL_SLUG, diagnostics),
    lib: discoverNamedDirectory(root, "lib", entries, TOOL_SLUG, diagnostics),
  };

  return { agent, diagnostics };
}

function discoverFlatModule(root: string, baseName: string, entries: Dirent[], diagnostics: DiscoverDiagnostic[]): string | undefined {
  const candidates: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    const ext = extname(name);
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    if (basename(name, ext) !== baseName) continue;
    candidates.push(name);
  }

  if (candidates.length > 1) {
    diagnostics.push({
      code: "MODULE_SLOT_COLLISION",
      message: `Multiple module sources for "${baseName}": ${candidates.join(", ")}`,
      severity: "error",
      filePath: root,
    });
  }

  if (candidates.length === 0) return undefined;
  return join(root, candidates[0]);
}

function discoverInstructions(root: string, entries: Dirent[], diagnostics: DiscoverDiagnostic[]): string | undefined {
  const mdCandidate = entries.find(e => e.isFile() && e.name.toLowerCase() === "instructions.md");
  if (mdCandidate) return join(root, mdCandidate.name);

  const tsCandidate = entries.find(e => {
    if (!e.isFile()) return false;
    const ext = extname(e.name);
    return SUPPORTED_EXTENSIONS.has(ext) && basename(e.name, ext) === "instructions";
  });
  if (tsCandidate) return join(root, tsCandidate.name);

  const legacyMdCandidate = entries.find(e => e.isFile() && e.name.toLowerCase() === "system.md");
  if (legacyMdCandidate) {
    diagnostics.push({
      code: "DEPRECATED_SYSTEM_SLOT",
      message: `"system.md" is deprecated. Rename to "instructions.md".`,
      severity: "warning",
      filePath: join(root, legacyMdCandidate.name),
    });
    return join(root, legacyMdCandidate.name);
  }

  return undefined;
}

function discoverNamedDirectory(root: string, dirName: string, entries: Dirent[], slugPattern: RegExp, diagnostics: DiscoverDiagnostic[]): DiscoveredSlot[] {
  const dirEntry = entries.find(e => e.isDirectory() && e.name === dirName);
  if (!dirEntry) return [];

  const dirPath = join(root, dirName);
  const slots: DiscoveredSlot[] = [];

  try {
    const files = readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;

      const ext = extname(file.name);
      const name = basename(file.name, ext);

      if (file.name === ".gitkeep") continue;

      if (ext === ".md") {
        if (!slugPattern.test(name)) {
          diagnostics.push({
            code: "INVALID_SLOT_NAME",
            message: `Invalid ${dirName} name "${name}" — does not match slug pattern.`,
            severity: "warning",
            filePath: join(dirPath, file.name),
          });
        }
        slots.push({ name, filePath: join(dirPath, file.name), type: "markdown", kind: "named" });
        continue;
      }

      if (SUPPORTED_EXTENSIONS.has(ext)) {
        if (!slugPattern.test(name)) {
          diagnostics.push({
            code: "INVALID_SLOT_NAME",
            message: `Invalid ${dirName} name "${name}" — does not match slug pattern.`,
            severity: "warning",
            filePath: join(dirPath, file.name),
          });
        }
        slots.push({ name, filePath: join(dirPath, file.name), type: "module", kind: "named" });
      }
    }
  } catch {
    diagnostics.push({
      code: "DIRECTORY_READ_ERROR",
      message: `Could not read directory: ${dirPath}`,
      severity: "error",
    });
  }

  return slots.sort((a, b) => a.name.localeCompare(b.name));
}
