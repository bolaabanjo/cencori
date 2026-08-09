/**
 * Adapter SDK — the contract every adapter implements. An adapter has two
 * halves (COMPUTE_UNIVERSAL_DEPLOY.md §5):
 *   - build-time: `detect` + `plan` (run here, in the pipeline)
 *   - runtime:    a shim that serves the Runtime Contract (ships in the base image)
 *
 * This file is the build-time interface. `defineAdapter` is an identity helper
 * for typing/registration.
 */

import type { AgentBuildPlan, Compatibility, DetectionContext, DetectionResult } from './types';

export interface Adapter {
    /** Package-style id, e.g. "@cencori/adapter-langgraph". */
    name: string;
    /** Human label for the dashboard, e.g. "LangGraph". */
    displayName: string;
    /** Which compatibility layer this adapter represents (§1). */
    compatibility: Compatibility;
    /** Static scan → confidence + evidence. Never executes repo code. */
    detect(ctx: DetectionContext): Promise<DetectionResult>;
    /** Called only for the winning adapter → the normalized build plan. */
    plan(ctx: DetectionContext, detection: DetectionResult): Promise<AgentBuildPlan>;
}

export function defineAdapter(adapter: Adapter): Adapter {
    return adapter;
}
