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
    PHASE1_SCOPES,
    fromMemoryId,
    parseMemoryDirective,
    toMemoryId,
} from './types';
export type {
    ExtractedFact,
    MemoryDirective,
    MemoryDirectiveInput,
    MemoryExtractOverride,
    MemoryScope,
    MemorySettings,
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
export { rememberExchange, runChatMemoryWriteback, writeMemories } from './writeback';
export type { RememberExchangeResult } from './writeback';
