/**
 * Cencori Memory — gateway-level conversation memory.
 *
 * Retrieval is fail-open (never breaks a chat request); writeback is async
 * (waitUntil) and post-redaction; org/project scoping always derives from
 * the authenticated GatewayContext.
 */

export {
    DEFAULT_MEMORY_SETTINGS,
    MEMORY_CONTENT_MAX_CHARS,
    MEMORY_MANAGED_MODEL,
    PHASE1_SCOPES,
    fromMemoryId,
    parseMemoryDirective,
    resolveMemoryModel,
    toMemoryId,
} from './types';
export type {
    ExtractedFact,
    MemoryDirective,
    MemoryDirectiveInput,
    MemoryExtractOverride,
    MemoryScope,
    MemorySettings,
    MemorySource,
    ParseDirectiveResult,
    RetrievedMemory,
    WrittenMemory,
} from './types';

export { getProjectMemorySettings } from './settings';
export { embedForMemory, MEMORY_EMBEDDING_MODEL, MEMORY_EMBEDDING_DIMENSIONS } from './embeddings';
export {
    appendSessionMemories,
    clearSessionMemories,
    listSessionMemories,
    SESSION_MEMORY_CAP,
} from './session-store';
export { buildQuotaCheckFailedBody, buildQuotaExceededBody, checkMemoryQuota } from './quota';
export type { MemoryQuotaStatus } from './quota';
export {
    buildMemorySystemBlock,
    buildMemoryIndexBlock,
    buildMemoryBlock,
    memorySummary,
    retrieveMemories,
} from './retrieval';
export type { MemoryEmbeddingUsage } from './retrieval';
export { redactFact } from './redact';
export {
    fetchMemoryById,
    executeMemoryFetchTool,
    MEMORY_FETCH_TOOL,
    MEMORY_FETCH_TOOL_NAME,
} from './fetch';
export type { FetchedMemory, MemoryFetchToolResult } from './fetch';
export { DEFAULT_EXTRACTION_PROMPT, extractFacts, parseExtractionOutput } from './extraction';
export {
    normalizeName,
    normalizeEntityKey,
    resolveEntity,
    parseEntityExtraction,
    matchEntityMentions,
    findSeedEntities,
    mentionsName,
} from './entities';
export type {
    ExtractedEntity,
    ExtractedRelation,
    EntityExtraction,
    EntityMention,
    EntitySurfaceForms,
    ExistingEntity,
    ResolveResult,
} from './entities';
export { traverseGraph, reachableEntityIds } from './graph';
export type { GraphEdge, TraversalHit, TraverseOptions } from './graph';
export { retrieveGraphMemories } from './graph-recall';
export type { GraphRecallParams } from './graph-recall';
export {
    memoryStrength,
    classifyStrength,
    suggestForForgetting,
    daysSinceUse,
} from './strength';
export type { StrengthInput, StrengthBand, ForgetSuggestion } from './strength';
export {
    extractEntities,
    persistEntityGraph,
    runEntityGraphWriteback,
    ENTITY_EXTRACTION_PROMPT,
} from './entity-persist';
export type {
    ExtractEntitiesResult,
    PersistEntityGraphResult,
    EntityGraphWritebackResult,
} from './entity-persist';
export { rememberExchange, runChatMemoryWriteback, writeMemories } from './writeback';
export type { RememberExchangeResult } from './writeback';
