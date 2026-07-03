# Project Layout

```
my-agent/
├── agent/
│   ├── agent.ts           # defineAgent({ model, cencori })
│   ├── instructions.md    # always-on system prompt
│   ├── tools/             # defineTool — what the agent can do
│   ├── knowledge/         # defineSkill — what the agent knows
│   ├── subagents/         # specialist child agents
│   ├── channels/          # defineChannel — HTTP, Slack, etc.
│   ├── schedules/         # defineSchedule — recurring jobs
│   ├── sessions/          # durable execution configuration
│   └── policies/          # security, budgets, guardrails
├── package.json
└── tsconfig.json
```

## agent.ts

Required config. Defines the model and Cencori integration:

```ts
import { defineAgent } from "eline";

export default defineAgent({
  model: "claude-sonnet-4-5",
  cencori: {
    project: "proj_abc",
    billing: { budget: "50.00/month" },
  },
});
```

## instructions.md

Required. The system prompt that defines the agent's personality and behavior.

## tools/

Optional. TypeScript files exporting a `defineTool` config:

```ts
import { defineTool } from "eline/tools";
import { z } from "zod";

export default defineTool({
  description: "...",
  inputSchema: z.object({ ... }),
  async execute(input) { ... },
});
```

## knowledge/

Optional. Markdown or TypeScript files with reference knowledge the agent can load on demand.

## channels/

Optional. HTTP, Slack, or custom message ingress.

## schedules/

Optional. Recurring cron jobs.

## sessions/

Optional. Configure session behavior:

```ts
export default {
  maxTurns: 50,
  idleTimeoutMs: 300000,
  memory: { strategy: "lastN", limit: 20 },
};
```

## policies/

Optional. Security guards and budgets:

```ts
export default {
  inputGuards: ["pii-redaction"],
  outputGuards: ["content-filtering"],
  budget: { maxSpendPerSession: "5.00" },
};
```
