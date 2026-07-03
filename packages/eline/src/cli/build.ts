import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { loadAgent } from "../loader.js";
import { discoverAgent } from "../discover/index.js";

export async function buildCommand(options: {
  agentDir: string;
  outDir: string;
}): Promise<void> {
  const agentDirPath = resolve(process.cwd(), options.agentDir);
  const outDir = resolve(process.cwd(), options.outDir);

  console.log(`\n  Building agent...\n`);

  if (!existsSync(agentDirPath)) {
    console.error(`  Agent directory not found: ${agentDirPath}`);
    process.exit(1);
  }

  const { agent: discovered, diagnostics } = discoverAgent(agentDirPath);

  if (diagnostics.some((d) => d.severity === "error")) {
    for (const d of diagnostics) {
      console.error(`  ✖ ${d.code}: ${d.message}`);
    }
    process.exit(1);
  }

  try {
    const agent = await loadAgent(agentDirPath);

    mkdirSync(outDir, { recursive: true });

    const manifest = {
      config: agent.manifest.config,
      instructions: agent.manifest.instructions,
      tools: Object.keys(agent.manifest.tools),
      skills: Object.keys(agent.manifest.skills),
      hooks: Object.keys(agent.manifest.hooks),
      channels: Object.keys(agent.manifest.channels),
      schedules: Object.keys(agent.manifest.schedules),
      discovered: {
        tools: discovered.tools.map((t) => t.name),
        skills: discovered.skills.map((s) => s.name),
        hooks: discovered.hooks.map((h) => h.name),
        channels: discovered.channels.map((c) => c.name),
        schedules: discovered.schedules.map((s) => s.name),
      },
      session: agent.manifest.session,
      policy: agent.manifest.policy,
    };

    writeFileSync(
      join(outDir, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );

    console.log(`  Written to ${outDir}/manifest.json`);
    console.log(`  Tools: ${manifest.tools.length}`);
    console.log(`  Skills: ${manifest.skills.length}`);
    console.log(`  Channels: ${manifest.channels.length}`);
    console.log(`  Schedules: ${manifest.schedules.length}`);
    console.log(`\n  Done.\n`);
  } catch (err) {
    console.error(`  Build failed:`, err);
    process.exit(1);
  }
}
