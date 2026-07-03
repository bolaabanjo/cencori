#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./init.js";
import { devCommand } from "./dev.js";
import { buildCommand } from "./build.js";
import { showBanner } from "./banner.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "../../package.json");
let version = "0.1.0";
try {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  version = pkg.version;
} catch {}

showBanner();

const program = new Command();

program
  .name("eline")
  .description("Eline — the electronic line, build agents at the speed of light")
  .version(version);

program
  .command("init")
  .description("Scaffold a new agent project")
  .argument("[name]", "Project directory name")
  .option("--template <name>", "Template to use (default, agent-only)", "default")
  .action(initCommand);

program
  .command("dev")
  .description("Run the agent locally")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .option("--agent-dir <path>", "Path to agent directory", "agent")
  .action(devCommand);

program
  .command("build")
  .description("Compile the agent for production")
  .option("--agent-dir <path>", "Path to agent directory", "agent")
  .option("--out-dir <path>", "Output directory", ".eline")
  .action(buildCommand);

program.parse(process.argv);
