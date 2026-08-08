/**
 * Cencori AI SDK
 * 
 * The unified infrastructure layer for AI applications.
 * One SDK. Every AI primitive. Always secure. Always logged.
 * 
 * @example Unified SDK (Recommended)
 * ```typescript
 * import { Cencori } from 'cencori';
 * 
 * const cencori = new Cencori({ apiKey: 'csk_...' });
 * 
 * // AI Gateway
 * await cencori.ai.chat({ model: 'gpt-4o', messages: [...] });
 * 
 * // Streaming
 * for await (const chunk of cencori.ai.chatStream({ model: 'gpt-4o', messages })) {
 *   process.stdout.write(chunk.delta);
 * }
 * 
 * // Compute (coming soon)
 * await cencori.compute.run('my-function', { input: data });
 * 
 * // Workflow (coming soon)
 * await cencori.workflow.trigger('pipeline-id', { data });
 * 
 * // Storage (coming soon)
 * await cencori.storage.vectors.search('query');
 * ```
 * 
 * @example Vercel AI SDK Integration
 * ```typescript
 * import { cencori } from 'cencori/vercel';
 * import { streamText } from 'ai';
 * 
 * const result = await streamText({
 *   model: cencori('gpt-4o'),
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 * 
 * @example TanStack AI Integration
 * ```typescript
 * import { cencori } from 'cencori/tanstack';
 * ```
 */

// Unified SDK
export { Cencori } from './cencori';
export type {
    CencoriConfig,
    ChatRequest,
    ChatResponse,
    ChatMessage,
    CompletionRequest,
    EmbeddingRequest,
    EmbeddingResponse,
    ResponsesRequest,
    ResponsesResponse,
    ResponsesOutputItem,
    ResponseInputItem,
    ResponsesTool,
    WebSearchTool,
    FileSearchTool,
    CodeInterpreterTool,
    UrlCitation,
    RequestOptions,
} from './types';

// Error classes
export {
    CencoriError,
    AuthenticationError,
    RateLimitError,
    SafetyError,
} from './errors';

// Utilities
export { fetchWithRetry } from './utils';

// Namespace exports for advanced usage
export { AINamespace, type StreamChunk } from './ai';
export {
    DocumentsNamespace,
    type DocumentInput,
    type DocumentRequest,
    type DocumentQueryRequest,
    type DocumentExtractResult,
    type DocumentSummarizeResult,
    type DocumentQueryResult,
    type DocumentExtractMethod,
    type DocumentKind,
    type DocumentUsage,
    type DocumentCost,
} from './documents';

export {
    VisionNamespace,
    type VisionProvider,
    type VisionTask,
    type VisionImage,
    type VisionRequest,
    type VisionResult,
    type VisionDescribeResult,
    type VisionOcrResult,
    type VisionClassifyResult,
    type VisionClassification,
    type VisionStreamChunk,
    type VisionUsage,
    type VisionCost,
} from './vision';
export {
    VoiceNamespace,
    type TTSProvider,
    type STTProvider,
    type AudioFormat,
    type TranscriptFormat,
    type AudioInput,
    type SpeakRequest,
    type SpeakResult,
    type TranscribeRequest,
    type TranscribeResult,
    type TranscriptSegment,
    type TranscriptWord,
    type VoiceModelInfo,
} from './voice';
export { AgentsNamespace, type Agent, type AgentConfig, type AgentListItem, type CreateAgentParams, type UpdateAgentParams, type AgentKey, type CreateAgentKeyParams } from './agents';
export { ComputeNamespace } from './compute';
export { WorkflowNamespace } from './workflow';
export { StorageNamespace } from './storage';
export { MemoryClient, MEMORY_FETCH_TOOL } from './memory';
export type {
    FetchedMemory,
    RecallOptions,
    SearchScopedMemoryOptions,
    ForgetSuggestionsOptions,
    ForgetSuggestionsResult,
    RememberGraphOptions,
    RememberGraphResult,
    GraphQueryOptions,
    GraphResult,
    ListEntitiesOptions,
    EntitiesResult,
} from './memory';
export {
    ChatNamespace,
    type ChatMemoryOptions,
    type ChatCompletionCreateParams,
    type ChatCompletionResponse,
    type ChatCompletionChunk,
    type ChatCompletionStream,
} from './chat';
export { SessionsNamespace, type Session, type SessionEvent, type CreateSessionParams, type TurnParams, type PaginatedResponse, type SessionListParams } from './sessions';
export { TelemetryClient, type WebTelemetryPayload } from './telemetry';
export {
    WebNamespace,
    WEB_SEARCH_TOOL,
    WEB_FETCH_TOOL,
    type WebFetchRequest,
    type WebFetchResult,
    type WebExtractResult,
    type WebLink,
    type WebEvidenceSpan,
    type WebSearchRequest,
    type WebSearchHit,
    type WebSearchResponse,
    type WebCrawlRequest,
    type WebCrawlResponse,
    type WebBrowserAction,
    type WebBrowseRequest,
    type WebBrowseJob,
    type WebTakedownRequest,
    type WebTakedownResponse,
} from './web';

// Default export for convenience
export { Cencori as default } from './cencori';

// Re-export Vercel integration for backwards compatibility
// Users can also import from 'cencori/vercel' directly
export { cencori, createCencori } from './vercel';
export type { CencoriProvider, CencoriProviderSettings, CencoriChatSettings } from './vercel';
