/**
 * Celo Agent Template
 *
 * Generates a Celo integration starter layered on top of the Cencori agent core.
 */

export interface TemplateOptions {
    projectName: string;
    apiKey: string;
}

export function getCeloAgentTemplate(options: TemplateOptions): Record<string, string> {
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
            dependencies: {
                viem: '^2.39.3',
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

    files['.env'] = `# Cencori is the default agent infrastructure.
# Get a project key: https://cencori.com/dashboard/organizations/settings
# Create an agent-scoped key: POST /v1/agents/:id/keys
CENCORI_API_KEY=${options.apiKey || ''}
CENCORI_AGENT_ID=
CENCORI_BASE_URL=https://api.cencori.com/v1
CENCORI_MODEL=dots-studio/dots-3-note-preview:free

# Celo Sepolia
CELO_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
CELO_PRIVATE_KEY=
CELO_RECEIPTS_CONTRACT=
CELO_EXPLORER_URL=https://celo-sepolia.blockscout.com

# Receipt-only payment story (NOT an onchain USDC transfer in this starter)
DEMO_PAYEE_ADDRESS=
DEMO_PAYMENT_TOKEN=USDC
DEMO_PAYMENT_AMOUNT=0.05
DEMO_MAX_SPEND_USD=0.10
`;

    files['.env.example'] = `# Cencori is the default agent infrastructure.
# Get a project key: https://cencori.com/dashboard/organizations/settings
# Create an agent-scoped key: POST /v1/agents/:id/keys
CENCORI_API_KEY=csk_...
CENCORI_AGENT_ID=
CENCORI_BASE_URL=https://api.cencori.com/v1
CENCORI_MODEL=dots-studio/dots-3-note-preview:free

# Celo Sepolia
CELO_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
CELO_PRIVATE_KEY=0x...
CELO_RECEIPTS_CONTRACT=0x...
CELO_EXPLORER_URL=https://celo-sepolia.blockscout.com

# Demo payment metadata
DEMO_PAYEE_ADDRESS=0x...
DEMO_PAYMENT_TOKEN=USDC
DEMO_PAYMENT_AMOUNT=0.05
DEMO_MAX_SPEND_USD=0.10
`;

    files['contracts/AgentRunReceipts.sol'] = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract AgentRunReceipts {
    event AgentRunRecorded(
        bytes32 indexed receiptHash,
        string indexed externalRunId,
        address indexed recorder,
        string receiptURI
    );

    function recordRun(
        bytes32 receiptHash,
        string calldata externalRunId,
        string calldata receiptURI
    ) external {
        emit AgentRunRecorded(receiptHash, externalRunId, msg.sender, receiptURI);
    }
}
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

    files['src/receipt.mjs'] = `import crypto from "node:crypto";

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

export function hashReceipt(receipt) {
  const canonical = stableJson(receipt);
  const digest = crypto.createHash("sha256").update(canonical).digest("hex");
  return \`0x\${digest}\`;
}

export function createReceipt({
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
  celo,
}) {
  return {
    type: "cencori.agent_run_receipt",
    version: "0.1",
    network: "celo-sepolia",
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
    celo,
  };
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
        "Simulated Cencori response: Celo gives agents stablecoin payments, identity, reputation, and low-cost settlement. Cencori gives those agents routing, traces, approvals, budgets, and security.",
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
      instructions: "You are a concise research agent. Produce a useful market brief with practical partnership implications.",
      metadata: {
        demo: "cencori-celo-agent-starter",
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

    files['src/celo-record.mjs'] = `const receiptsAbiSource = [
  "function recordRun(bytes32 receiptHash,string externalRunId,string receiptURI)",
];

export async function recordReceiptOnCelo({
  rpcUrl,
  privateKey,
  contractAddress,
  receiptHash,
  externalRunId,
  receiptURI,
}) {
  if (!privateKey || !contractAddress || contractAddress === "0x...") {
    return {
      simulated: true,
      txHash: null,
      message:
        "Missing CELO_PRIVATE_KEY or CELO_RECEIPTS_CONTRACT. Receipt generated locally but not recorded onchain.",
    };
  }

  const [{ createPublicClient, createWalletClient, http, parseAbi }, { privateKeyToAccount }, { celoSepolia }] =
    await Promise.all([
      import("viem"),
      import("viem/accounts"),
      import("viem/chains"),
    ]);

  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : \`0x\${privateKey}\`);
  const transport = http(rpcUrl);
  const abi = parseAbi(receiptsAbiSource);

  const publicClient = createPublicClient({
    chain: celoSepolia,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: celoSepolia,
    transport,
  });

  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: "recordRun",
    args: [receiptHash, externalRunId, receiptURI],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    simulated: false,
    txHash,
    recorder: account.address,
  };
}
`;

    files['src/index.mjs'] = `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCencoriAgent } from "./cencori-agent.mjs";
import { recordReceiptOnCelo } from "./celo-record.mjs";
import { createReceipt, hashReceipt, stableJson } from "./receipt.mjs";
import { loadEnv, readEnv, readOptionalAgentId } from "./env.mjs";

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../output");

const agentId = readOptionalAgentId();
const externalRunId = \`cencori-celo-\${Date.now()}\`;
const task =
  "Write a short market brief explaining why Cencori and Celo together matter for production agents that can safely move money.";

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

const receipt = createReceipt({
  agentId,
  agentName: agentId ? "Cencori x Celo Research Agent" : "Cencori project agent",
  model: readEnv("CENCORI_MODEL", "dots-studio/dots-3-note-preview:free"),
  externalRunId,
  task,
  status: "completed",
  startedAt,
  completedAt,
  outputPreview: result.content.slice(0, 500),
  usage: result.usage,
  controls: {
    shadow_mode: true,
    approval_required: false,
    max_spend_usd: readEnv("DEMO_MAX_SPEND_USD", "0.10"),
    cencori_request_id: result.requestId,
    cencori_response_simulated: result.simulated,
  },
  celo: {
    chain_id: 11142220,
    payment_token: readEnv("DEMO_PAYMENT_TOKEN", "USDC"),
    payment_amount: readEnv("DEMO_PAYMENT_AMOUNT", "0.05"),
    payee: readEnv("DEMO_PAYEE_ADDRESS", ""),
    payment_settled_onchain: false,
    payment_note:
      "payment_* fields are receipt metadata only; onchain tx is recordRun(receiptHash), not a token transfer",
  },
});

const receiptHash = hashReceipt(receipt);

fs.mkdirSync(outputDir, { recursive: true });
const receiptPath = path.join(outputDir, \`\${externalRunId}.json\`);
fs.writeFileSync(receiptPath, \`\${stableJson({ ...receipt, receipt_hash: receiptHash })}\\n\`);

const onchain = await recordReceiptOnCelo({
  rpcUrl: readEnv("CELO_RPC_URL", "https://forno.celo-sepolia.celo-testnet.org"),
  privateKey: readEnv("CELO_PRIVATE_KEY"),
  contractAddress: readEnv("CELO_RECEIPTS_CONTRACT"),
  receiptHash,
  externalRunId,
  receiptURI: \`file://\${receiptPath}\`,
});

const explorerBase = readEnv("CELO_EXPLORER_URL", "https://celo-sepolia.blockscout.com");
const explorerUrl = onchain.txHash ? \`\${explorerBase.replace(/\\/+$/, "")}/tx/\${onchain.txHash}\` : null;

console.log("");
console.log("Cencori x Celo Agent Receipt Demo");
console.log("---------------------------------");
console.log(\`Run: \${externalRunId}\`);
console.log(\`Cencori request: \${result.requestId}\`);
console.log(\`Receipt hash: \${receiptHash}\`);
console.log(\`Receipt file: \${receiptPath}\`);
console.log(\`Onchain recorded: \${onchain.simulated ? "no (simulation mode)" : "yes"}\`);
if (onchain.message) console.log(\`Note: \${onchain.message}\`);
if (explorerUrl) console.log(\`Celo explorer: \${explorerUrl}\`);
console.log(
  "Payment fields in receipt JSON are metadata only (no USDC transfer in this starter)."
);
console.log("");
console.log("Agent output preview:");
console.log(result.content.slice(0, 800));
console.log("");
`;

    files['README.md'] = `# ${options.projectName}

Celo Agent Integration Starter powered by Cencori.

This scaffold is designed for Celo agent hackathon builders who want to ship quickly with Cencori as the default agent infrastructure and Celo as the onchain economy layer.

\`\`\`text
Cencori for agent infrastructure.
Celo for agent economy.
\`\`\`

## Payments vs onchain proof

- **Onchain in this repo:** \`recordRun(receiptHash, …)\` on \`AgentRunReceipts\` (proof event).
- **Not in this repo:** USDC/USDT transfers, x402 charges, or MiniPay sends.
- \`DEMO_PAYMENT_*\` values are copied into the receipt JSON for demos; they do not execute a payment.

## What You Get

- Cencori Gateway wired in by default.
- A default agent task that runs through Cencori.
- A structured agent run receipt.
- A receipt hash for proof.
- A tiny Celo Sepolia receipt contract.
- Optional onchain receipt recording.
- Simulation mode when keys are missing, so the starter runs immediately.

## Quickstart

\`\`\`bash
npm install
npm run demo
\`\`\`

The first run works in simulation mode. To use real Cencori model calls, set:

\`\`\`bash
CENCORI_API_KEY=csk_...
# Leave CENCORI_AGENT_ID empty for project-key-only, or set an agent UUID:
# CENCORI_AGENT_ID=
\`\`\`

To record receipts on Celo Sepolia, deploy \`contracts/AgentRunReceipts.sol\` and set:

\`\`\`bash
CELO_PRIVATE_KEY=0x...
CELO_RECEIPTS_CONTRACT=0x...
\`\`\`

## Expected Output

\`\`\`text
Cencori x Celo Agent Receipt Demo
---------------------------------
Run: cencori-celo-...
Cencori request: req_...
Receipt hash: 0x...
Receipt file: .../output/cencori-celo-....json
Onchain recorded: yes
Celo explorer: https://celo-sepolia.blockscout.com/tx/0x...
\`\`\`

## Product Pattern

This integration demonstrates a reusable pattern:

\`\`\`text
Cencori Agent -> Celo Action -> Verifiable Receipt
\`\`\`

Use it for:

- Paid research agents.
- Refund agents.
- Remittance assistants.
- AI contractor payouts.
- x402 paid tools.
- ERC-8004 agent reputation.
- MiniPay-facing agent apps.

## Celo Sepolia

\`\`\`text
Chain ID: 11142220
RPC: https://forno.celo-sepolia.celo-testnet.org
Explorer: https://celo-sepolia.blockscout.com
\`\`\`

## Next Steps

- Replace the default task in \`src/index.mjs\`.
- Add your own tools around the Cencori agent call.
- Record receipt hashes on Celo Sepolia.
- Add x402 payments for paid APIs.
- Register your agent with ERC-8004 when ready.
`;

    return files;
}
