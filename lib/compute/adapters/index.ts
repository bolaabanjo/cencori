/**
 * Cencori adapter SDK + registry — the universal-deploy foundation.
 * See COMPUTE_UNIVERSAL_DEPLOY.md.
 */

export * from './types';
export { defineAdapter, type Adapter } from './sdk';
export { createGithubDetectionContext } from './github-context';
export { ADAPTERS, detectAgent, type DetectionOutcome } from './registry';
export { arcieAdapter } from './arcie';
export { langgraphAdapter } from './langgraph';
export { crewaiAdapter } from './crewai';
export { openaiAgentsAdapter } from './openai-agents';
export { mastraAdapter } from './mastra';
export { vercelEveAdapter } from './vercel-eve';
export { genericNodeAdapter } from './generic-node';
export { genericPythonAdapter } from './generic-python';
export { httpAdapter } from './http';
export { dockerAdapter } from './docker';
