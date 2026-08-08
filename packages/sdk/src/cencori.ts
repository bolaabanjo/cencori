/**
 * Cencori - Unified AI Infrastructure SDK
 * 
 * One SDK for AI Gateway, Compute, Workflow, and Storage.
 * Every operation is secured, logged, and tracked.
 * 
 * @example
 * import { Cencori } from 'cencori';
 * 
 * const cencori = new Cencori({ apiKey: 'csk_...' });
 * 
 * // AI Gateway
 * const response = await cencori.ai.chat({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * 
 * // Compute (coming soon)
 * await cencori.compute.run('my-function', { input: data });
 * 
 * // Workflow (coming soon)
 * await cencori.workflow.trigger('pipeline-id', { data });
 * 
 * // Storage (coming soon)
 * await cencori.storage.vectors.search('query');
 */

import type { CencoriConfig, RequestOptions } from './types';
import { AINamespace } from './ai';
import { AgentsNamespace } from './agents';
import { VisionNamespace } from './vision';
import { VoiceNamespace } from './voice';
import { DocumentsNamespace } from './documents';
import { SessionsNamespace } from './sessions';
import { ComputeNamespace } from './compute';
import { WorkflowNamespace } from './workflow';
import { StorageNamespace } from './storage';
import { MemoryClient } from './memory';
import { ChatNamespace } from './chat';
import { TelemetryClient } from './telemetry';
import { WebNamespace } from './web';
import { fetchWithRetry } from './utils';
import {
    CencoriError,
    AuthenticationError,
    RateLimitError,
    SafetyError
} from './errors';

const DEFAULT_BASE_URL = 'https://cencori.com';

interface ErrorResponse {
    error?: string;
    reasons?: string[];
}

export class Cencori {
    private config: Required<CencoriConfig>;

    /**
     * AI Gateway - Chat, completions, embeddings, responses with security & observability
     * 
     * @example
     * await cencori.ai.chat({ model: 'gpt-4o', messages: [...] });
     */
    readonly ai: AINamespace;

    /**
     * Chat - OpenAI-compatible chat completions with gateway memory.
     * One line makes chat stateful.
     *
     * @example
     * const response = await cencori.chat.completions.create({
     *   model: 'gpt-4o',
     *   messages: [{ role: 'user', content: 'What did we agree about pricing?' }],
     *   memory: { userId: session.user.id },
     * });
     */
    readonly chat: ChatNamespace;

    /**
     * Vision - Analyze, describe, OCR, and classify images
     *
     * @example
     * const result = await cencori.vision.analyze({
     *   image: { url: 'https://example.com/photo.jpg' },
     *   prompt: 'What breed is this dog?'
     * });
     *
     * @example
     * const { text } = await cencori.vision.ocr({
     *   image: { base64, mimeType: 'image/png' }
     * });
     */
    readonly vision: VisionNamespace;

    /**
     * Voice - Text-to-speech and speech-to-text across providers
     *
     * @example
     * const { audio } = await cencori.voice.speak({
     *   input: 'Hello from Cencori.',
     *   model: 'aura-asteria-en', // Deepgram; provider inferred from model
     * });
     *
     * @example
     * const { text } = await cencori.voice.transcribe({
     *   audio: fileBytes,
     *   model: 'nova-3',
     * });
     *
     * @example
     * const { segments } = await cencori.voice.diarize({
     *   audio: fileBytes,
     *   model: 'assemblyai-universal',
     * });
     */
    readonly voice: VoiceNamespace;

    /**
     * Documents - Extract text from PDFs and images, summarize, and query
     *
     * @example
     * const { text } = await cencori.documents.extract({
     *   document: { url: 'https://example.com/contract.pdf' }
     * });
     *
     * @example
     * const { summary } = await cencori.documents.summarize({
     *   document: { url: 'https://example.com/report.pdf' }
     * });
     *
     * @example
     * const { answer } = await cencori.documents.query({
     *   document: { url },
     *   question: 'What is the total revenue for Q3?',
     * });
     */
    readonly documents: DocumentsNamespace;

    /**
     * Agents - Create and manage AI agents programmatically.
     * 
     * @example
     * const agent = await cencori.agents.create({
     *   name: 'my-agent',
     *   config: { model: 'gpt-4o', system_prompt: 'You are a helpful assistant.' }
     * });
     * 
     * @example
     * const key = await cencori.agents.createKey(agent.id, { name: 'prod-key' });
     */
    readonly agents: AgentsNamespace;

    /**
     * Compute - Serverless functions & GPU access
     * 
     * 🚧 Coming Soon
     * 
     * @example
     * await cencori.compute.run('my-function', { input: data });
     */
    readonly compute: ComputeNamespace;

    /**
     * Workflow - AI pipelines & orchestration
     * 
     * 🚧 Coming Soon
     * 
     * @example
     * await cencori.workflow.trigger('pipeline-id', { data });
     */
    readonly workflow: WorkflowNamespace;

    /**
     * Storage - Vector database, knowledge base, RAG
     * 
     * 🚧 Coming Soon
     * 
     * @example
     * await cencori.storage.vectors.search('query');
     */
    readonly storage: StorageNamespace;

    /**
     * Memory - Vector storage for RAG, conversation history, semantic search
     * 
     * @example
     * await cencori.memory.store({ namespace: 'conversations', content: '...' });
     * await cencori.memory.search({ namespace: 'conversations', query: '...' });
     */
    readonly memory: MemoryClient;

    /**
     * Sessions - Durable execution sessions for AI agents with pause/resume and event sourcing
     * 
     * @example
     * const sessions = await cencori.sessions.list({ status: 'active' });
     * const session = await cencori.sessions.create({ agent_id: 'ag_...' });
     * await cencori.sessions.submitTurn(session.id, { input: 'Hello' });
     */
    readonly sessions: SessionsNamespace;

    /**
     * Telemetry - Report web traffic from your app to the Cencori dashboard
     * 
     * @example
     * await cencori.telemetry.reportWebRequest({
     *   host: 'dochat-zeta.vercel.app',
     *   method: 'GET',
     *   path: '/api/chat',
     *   statusCode: 200,
     * });
     */
    readonly telemetry: TelemetryClient;

    /**
     * Web - First-party retrieval, extraction, crawling, and search.
     *
     * @example
     * await cencori.web.crawl({ seeds: ['https://docs.example.com'], maxPages: 10 });
     * const results = await cencori.web.search({ query: 'authentication guide' });
     */
    readonly web: WebNamespace;

    /**
     * Create a new Cencori client
     * 
     * @param config - Configuration options
     * @param config.apiKey - Your Cencori API key (starts with 'csk_')
     * @param config.baseUrl - Custom API base URL (default: https://cencori.com)
     * @param config.headers - Custom headers to include in requests
     * 
     * @example
     * const cencori = new Cencori({ 
     *   apiKey: process.env.CENCORI_API_KEY 
     * });
     */
    constructor(config: CencoriConfig = {}) {
        const apiKey = config.apiKey ?? process.env.CENCORI_API_KEY;

        if (!apiKey) {
            throw new Error(
                'Cencori API key is required. ' +
                'Pass it via new Cencori({ apiKey: "csk_..." }) or set CENCORI_API_KEY environment variable.'
            );
        }

        this.config = {
            apiKey,
            baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
            headers: config.headers ?? {},
        };

        // Initialize namespaces
        this.ai = new AINamespace(this.config);
        this.chat = new ChatNamespace(this.config);
        this.vision = new VisionNamespace(this.config);
        this.voice = new VoiceNamespace(this.config);
        this.documents = new DocumentsNamespace(this.config);
        this.agents = new AgentsNamespace(this.config);
        this.compute = new ComputeNamespace();
        this.workflow = new WorkflowNamespace();
        this.storage = new StorageNamespace();
        this.memory = new MemoryClient(this.config);
        this.sessions = new SessionsNamespace(this.config);
        this.telemetry = new TelemetryClient(this.config);
        this.web = new WebNamespace(this.config);
    }

    /**
     * Get the base URL for API calls
     */
    getBaseUrl(): string {
        return this.config.baseUrl;
    }

    /**
     * Get the API key
     */
    getApiKey(): string {
        return this.config.apiKey;
    }

    /**
     * Get the current configuration (API key is masked)
     */
    getConfig(): { baseUrl: string; apiKeyHint: string } {
        return {
            baseUrl: this.config.baseUrl,
            apiKeyHint: `${this.config.apiKey.slice(0, 6)}...${this.config.apiKey.slice(-4)}`,
        };
    }

    /**
     * Make a generic API request with retry and error handling
     * 
     * @example
     * const data = await cencori.request('/api/custom-endpoint', {
     *   method: 'POST',
     *   body: JSON.stringify({ foo: 'bar' })
     * });
     */
    async request<T>(endpoint: string, options: RequestOptions): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'CENCORI_API_KEY': this.config.apiKey,
            ...this.config.headers,
            ...options.headers
        };

        try {
            const response = await fetchWithRetry(url, {
                method: options.method,
                headers,
                body: options.body
            });

            const data: unknown = await response.json();

            // Handle API errors
            if (!response.ok) {
                const errorData = data as ErrorResponse;

                if (response.status === 401) {
                    throw new AuthenticationError(errorData.error || 'Invalid API key');
                }
                if (response.status === 429) {
                    throw new RateLimitError(errorData.error || 'Rate limit exceeded');
                }
                if (response.status === 400 && errorData.reasons) {
                    throw new SafetyError(errorData.error, errorData.reasons);
                }
                throw new CencoriError(
                    errorData.error || 'Request failed',
                    response.status
                );
            }

            return data as T;
        } catch (error) {
            // Re-throw custom errors
            if (error instanceof CencoriError) {
                throw error;
            }

            // Wrap unknown errors
            throw new CencoriError(
                error instanceof Error ? error.message : 'Unknown error occurred'
            );
        }
    }
}

// Export types
export type { CencoriConfig, ChatRequest, ChatResponse, ChatMessage, RequestOptions } from './types';
export type { AINamespace } from './ai';
export type { AgentsNamespace, Agent, AgentConfig, AgentListItem, CreateAgentParams, UpdateAgentParams, AgentKey, CreateAgentKeyParams } from './agents';
export type { ComputeNamespace } from './compute';
export type { WorkflowNamespace } from './workflow';
export type { StorageNamespace } from './storage';
export type { MemoryClient } from './memory';
export type { SessionsNamespace, Session, SessionEvent, CreateSessionParams, TurnParams, PaginatedResponse, SessionListParams } from './sessions';
export type { TelemetryClient, WebTelemetryPayload } from './telemetry';
