# Eline Documentation

Eline is a filesystem-first framework for production agents on Cencori.

## Getting Started

- [Getting Started](getting-started.md)
- [Project Layout](project-layout.md)

## Authoring

- `defineAgent` — Agent configuration
- `defineTool` — Tool creation
- `defineInstructions` — System prompt
- `defineSkill` — Loadable procedures
- `defineHook` — Lifecycle hooks
- `defineChannel` — Message channels
- `defineSchedule` — Recurring jobs

## Runtime

- `getSession` — Current session context
- `getContext` — Shared context
- `runAgent` — Execute a single turn
- `streamAgent` — Stream a response

## Cencori Integration

- `cencori: {}` config block in agent.ts
- Policies (security, budgets, guardrails)
- Sessions (durable execution)
