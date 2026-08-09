/**
 * Adapter registry + the detection engine. Runs every adapter's detector over a
 * (non-executing) DetectionContext, ranks by confidence, and produces the
 * winning build plan plus the alternatives. Native adapters outrank language
 * fallbacks; if nothing matches, callers fall through to HTTP/Docker/Custom
 * (COMPUTE_UNIVERSAL_DEPLOY.md §1) rather than ever saying "unsupported".
 *
 * Ordered lowest-to-highest specificity is irrelevant — ranking is by score.
 */

import type { Adapter } from './sdk';
import type { AgentBuildPlan, DetectionContext } from './types';
import { arcieAdapter } from './arcie';
import { langgraphAdapter } from './langgraph';
import { crewaiAdapter } from './crewai';
import { openaiAgentsAdapter } from './openai-agents';
import { mastraAdapter } from './mastra';
import { vercelEveAdapter } from './vercel-eve';
import { dockerAdapter } from './docker';
import { httpAdapter } from './http';
import { genericNodeAdapter } from './generic-node';
import { genericPythonAdapter } from './generic-python';

// Order is cosmetic — the engine ranks by confidence. Native adapters score
// highest, then container/http, then the generic language fallbacks. Eventually
// loaded from versioned packages (§5).
export const ADAPTERS: Adapter[] = [
    arcieAdapter,
    langgraphAdapter,
    crewaiAdapter,
    openaiAgentsAdapter,
    mastraAdapter,
    vercelEveAdapter,
    dockerAdapter,
    httpAdapter,
    genericNodeAdapter,
    genericPythonAdapter,
];

export interface DetectionOutcome {
    plan: AgentBuildPlan;
    matchedAdapter: string;
    displayName: string;
    alternatives: { adapter: string; displayName: string; confidence: number; compatibility: string }[];
}

/** Detect the agent in a repo. Returns null when nothing matched at all (→ the
 *  UI offers HTTP/Docker/entry-point/Custom paths). */
export async function detectAgent(ctx: DetectionContext): Promise<DetectionOutcome | null> {
    const scored = await Promise.all(
        ADAPTERS.map(async (adapter) => ({ adapter, result: await adapter.detect(ctx) })),
    );
    const matched = scored
        .filter((s) => s.result.confidence > 0)
        .sort((a, b) => b.result.confidence - a.result.confidence);

    if (matched.length === 0) return null;

    const winner = matched[0];
    const plan = await winner.adapter.plan(ctx, winner.result);
    return {
        plan,
        matchedAdapter: winner.adapter.name,
        displayName: winner.adapter.displayName,
        alternatives: matched.slice(1).map((m) => ({
            adapter: m.adapter.name,
            displayName: m.adapter.displayName,
            confidence: m.result.confidence,
            compatibility: m.adapter.compatibility,
        })),
    };
}
