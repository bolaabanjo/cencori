import { createServer } from "node:http";
import { resolve } from "node:path";
import { loadAgent } from "../loader.js";
import { discoverAgent } from "../discover/index.js";
import { streamAgent } from "../runner/index.js";
import { showBanner } from "./banner.js";
import { encodeEvents, type StreamEvent } from "../protocol/events.js";

export async function devCommand(options: {
  port: string;
  agentDir: string;
}): Promise<void> {
  const port = parseInt(options.port, 10);
  const agentDirPath = resolve(process.cwd(), options.agentDir);

  showBanner();

  const { agent: discovered, diagnostics } = discoverAgent(agentDirPath);

  if (diagnostics.some((d) => d.severity === "error")) {
    for (const d of diagnostics) {
      console.error(`  ✖ ${d.code}: ${d.message}`);
    }
    process.exit(1);
  }

  for (const d of diagnostics) {
    console.warn(`  ⚠ ${d.code}: ${d.message}`);
  }

  console.log(`  Agent:  ${agentDirPath}`);
  console.log(`  Server: http://localhost:${port}`);
  console.log();

  if (discovered.agentConfig) {
    try {
      const agent = await loadAgent(agentDirPath);
      console.log(`  Model: ${agent.manifest.config.model}`);
      console.log(`  Tools: ${Object.keys(agent.manifest.tools).length}`);
      console.log();
    } catch {}
  }

  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/") {
      let body = "";
      for await (const chunk of req) body += chunk;

      try {
        const { message, stream } = JSON.parse(body);

        if (stream) {
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          for await (const event of streamAgent(agentDirPath, message)) {
            res.write(JSON.stringify(event) + "\n");
          }
          res.end();
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          for await (const event of streamAgent(agentDirPath, message)) {}
          const result = await loadAgent(agentDirPath).then((a) =>
            a.manifest.config
          );
          res.end(JSON.stringify({ status: "ok" }));
        }
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    console.log(`  Listening on http://localhost:${port}`);
    console.log(`  POST / with { "message": "hello" }`);
    console.log();
  });
}
