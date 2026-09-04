/**
 * Cencori Agent Template
 *
 * Generates a Cencori-native agent starter without tying the core agent
 * experience to any one integration.
 */

export interface TemplateOptions {
    projectName: string;
    apiKey: string;
}

export function getAgentTemplate(options: TemplateOptions): Record<string, string> {
    const files: Record<string, string> = {};

    files['package.json'] = JSON.stringify(
        {
            name: options.projectName,
            version: '0.1.0',
            private: true,
            type: 'module',
            scripts: {
                demo: 'node src/index.mjs',
            },
        },
        null,
        2
    );

    files['.gitignore'] = `node_modules/
.env
.env.*
!.env.example
output/
`;

    files['.env'] = `# Cencori is the agent infrastructure.
# Get a project key: https://cencori.com/dashboard/organizations/settings
# Create an agent-scoped key: POST /v1/agents/:id/keys
CENCORI_API_KEY=${options.apiKey || ''}
CENCORI_AGENT_ID=
CENCORI_BASE_URL=https://api.cencori.com/v1
CENCORI_MODEL=dots-studio/dots-3-note-preview:free

# Demo controls
AGENT_NAME=Cencori Research Agent
AGENT_MAX_SPEND_USD=0.10
`;

    files['.env.example'] = `# Cencori is the agent infrastructure.
# Get a project key: https://cencori.com/dashboard/organizations/settings
# Create an agent-scoped key: POST /v1/agents/:id/keys
CENCORI_API_KEY=csk_...
CENCORI_AGENT_ID=
CENCORI_BASE_URL=https://api.cencori.com/v1
CENCORI_MODEL=dots-studio/dots-3-note-preview:free

# Demo controls
AGENT_NAME=Cencori Research Agent
AGENT_MAX_SPEND_USD=0.10
`;

    files['src/env.mjs'] = `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");

export function loadEnv() {
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\\r?\\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^[\\"']|[\\"']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function readEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

/** Return agent ID only when set to a real UUID. */
export function readOptionalAgentId() {
  const raw = (process.env.CENCORI_AGENT_ID || "").trim();
  if (!raw) return null;
  return raw;
}
`;

    files['src/run-receipt.mjs'] = `import crypto from "node:crypto";

export function stableJson(value) {
  if (Array.isArray(value)) {
    return \`[\${value.map(stableJson).join(",")}]\`;
  }

  if (value && typeof value === "object") {
    return \`{\${Object.keys(value)
      .sort()
      .map((key) => \`\${JSON.stringify(key)}:\${stableJson(value[key])}\`)
      .join(",")}}\`;
  }

  return JSON.stringify(value);
}

export function createRunReceipt({
  agentId,
  agentName,
  model,
  externalRunId,
  task,
  status,
  startedAt,
  completedAt,
  outputPreview,
  usage,
  controls,
}) {
  return {
    type: "cencori.agent_run",
    version: "0.1",
    agent: {
      cencori_agent_id: agentId,
      name: agentName,
      model,
    },
    run: {
      external_run_id: externalRunId,
      task,
      status,
      started_at: startedAt,
      completed_at: completedAt,
      output_preview: outputPreview,
    },
    usage,
    controls,
  };
}

export function hashRunReceipt(receipt) {
  const canonical = stableJson(receipt);
  const digest = crypto.createHash("sha256").update(canonical).digest("hex");
  return \`0x\${digest}\`;
}
`;

    files['src/cencori-agent.mjs'] = `export async function runCencoriAgent({
  apiKey,
  baseUrl,
  agentId,
  model,
  task,
  externalRunId,
}) {
  if (!apiKey || apiKey === "csk_...") {
    return {
      simulated: true,
      requestId: \`sim_\${Date.now()}\`,
      content:
        "Simulated Cencori response: Cencori routes the model call, tracks the run, applies controls, and returns an auditable agent result.",
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: "0.00",
      },
    };
  }

  const response = await fetch(\`\${baseUrl.replace(/\\/+$/, "")}/responses\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
      "Content-Type": "application/json",
      ...(agentId ? { "X-Agent-ID": agentId } : {}),
      "X-Cencori-Trace-ID": externalRunId,
    },
    body: JSON.stringify({
      model,
      input: task,
      instructions: "You are a concise production agent. Return a useful answer and keep the output practical.",
      metadata: {
        demo: "cencori-agent-starter",
        external_run_id: externalRunId,
      },
    }),
  });

  const requestId =
    response.headers.get("x-request-id") ||
    response.headers.get("x-cencori-request-id") ||
    \`req_\${Date.now()}\`;

  if (!response.ok) {
    const body = await response.text();
    throw new Error(\`Cencori request failed (\${response.status}): \${body.slice(0, 500)}\`);
  }

  const json = await response.json();
  const textOutput = json?.output?.[0]?.content?.[0]?.text || "";
  const usage = json?.usage || {};

  return {
    simulated: false,
    requestId,
    content: textOutput,
    usage: {
      prompt_tokens: usage.input_tokens || 0,
      completion_tokens: usage.output_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      estimated_cost_usd: "0.00",
    },
  };
}
`;

    files['src/index.mjs'] = `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCencoriAgent } from "./cencori-agent.mjs";
import { createRunReceipt, hashRunReceipt, stableJson } from "./run-receipt.mjs";
import { loadEnv, readEnv, readOptionalAgentId } from "./env.mjs";

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../output");

const agentId = readOptionalAgentId();
const externalRunId = \`cencori-agent-\${Date.now()}\`;
const task =
  "Explain what this Cencori agent starter does and suggest one practical production use case.";

const startedAt = new Date().toISOString();

const result = await runCencoriAgent({
  apiKey: readEnv("CENCORI_API_KEY"),
  baseUrl: readEnv("CENCORI_BASE_URL", "https://api.cencori.com/v1"),
  agentId,
  model: readEnv("CENCORI_MODEL", "dots-studio/dots-3-note-preview:free"),
  task,
  externalRunId,
});

const completedAt = new Date().toISOString();

const receipt = createRunReceipt({
  agentId,
  agentName: readEnv("AGENT_NAME", agentId ? "Cencori Research Agent" : "Cencori project agent"),
  model: readEnv("CENCORI_MODEL", "dots-studio/dots-3-note-preview:free"),
  externalRunId,
  task,
  status: "completed",
  startedAt,
  completedAt,
  outputPreview: result.content.slice(0, 500),
  usage: result.usage,
  controls: {
    max_spend_usd: readEnv("AGENT_MAX_SPEND_USD", "0.10"),
    cencori_request_id: result.requestId,
    cencori_response_simulated: result.simulated,
  },
});

const receiptHash = hashRunReceipt(receipt);

fs.mkdirSync(outputDir, { recursive: true });
const receiptPath = path.join(outputDir, \`\${externalRunId}.json\`);
fs.writeFileSync(receiptPath, \`\${stableJson({ ...receipt, receipt_hash: receiptHash })}\\n\`);

console.log("");
console.log("Cencori Agent Starter Demo");
console.log("--------------------------");
console.log(\`Run: \${externalRunId}\`);
console.log(\`Cencori request: \${result.requestId}\`);
console.log(\`Receipt hash: \${receiptHash}\`);
console.log(\`Receipt file: \${receiptPath}\`);
console.log("");
console.log("Agent output preview:");
console.log(result.content.slice(0, 800));
console.log("");
`;

    files['README.md'] = `# ${options.projectName}

Cencori Agent Starter.

This scaffold demonstrates connecting an agent to the Cencori AI infrastructure — gateway, billing, security, and observability. Integrations for Celo, MiniPay, Slack, GitHub, databases, and MCP can be layered on top.

\`\`\`text
Cencori for AI infrastructure.
\`\`\`

## What You Get

- Cencori Responses API wired in by default.
- A demo agent task.
- A structured agent run receipt.
- A receipt hash for local proof/debugging.
- Simulation mode when keys are missing, so the starter runs immediately.

## Quickstart

\`\`\`bash
npm run demo
\`\`\`

The first run works in simulation mode. To use real Cencori model calls:

\`\`\`bash
CENCORI_API_KEY=csk_...
\`\`\`

Set \`CENCORI_AGENT_ID\` to an agent UUID to enable agent-scoped features (built-in tools, shadow mode). Create one via the API:

\`\`\`bash
curl -X POST https://api.cencori.com/v1/agents \\
  -H "Authorization: Bearer \${CENCORI_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-agent", "config": {"model": "dots-studio/dots-3-note-preview:free", "system_prompt": "You are a helpful assistant."}}'
\`\`\`

## Expected Output

\`\`\`text
Cencori Agent Starter Demo
--------------------------
Run: cencori-agent-...
Cencori request: req_...
Receipt hash: 0x...
Receipt file: .../output/cencori-agent-....json
\`\`\`

## Product Pattern

\`\`\`text
Cencori Agent -> Cencori Gateway -> Run Receipt
\`\`\`

Use this starter for:

- Customer support agents.
- Research agents.
- Code review agents.
- Workflow assistants.
- Internal operations agents.
- Payment agents with integrations layered on top.

## Add Integrations

For Celo agent economy features:

\`\`\`bash
npx create-cencori-app my-agent --template celo-agent
\`\`\`

That template adds Celo Sepolia receipts on top of the Cencori agent core.
`;

    return files;
}
