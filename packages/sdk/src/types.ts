/**
 * Shared types for Cencori SDK
 */

export interface CencoriConfig {
    /**
     * Cencori API key (starts with 'csk_')
     */
    apiKey?: string;

    /**
     * Base URL for Cencori API
     * @default 'https://cencori.com'
     */
    baseUrl?: string;

    /**
     * Custom headers to include in requests
     */
    headers?: Record<string, string>;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | MessageContent[];
    /** Tool call ID when role is 'tool' */
    tool_call_id?: string;
    /** Tool calls made by the assistant */
    tool_calls?: ToolCall[];
}

/**
 * Multimodal message content part
 */
export type MessageContent =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
    | { type: 'image'; image: string }; // base64 encoded image

/**
 * Tool/function definition for AI models
 */
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}

/**
 * Tool call made by the model
 */
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

/**
 * Tool choice configuration
 */
export type ToolChoice =
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };

export interface ChatRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    /** Tool definitions for function calling */
    tools?: ToolDefinition[];
    /** How the model chooses to call tools */
    toolChoice?: ToolChoice;
    /**
     * Reference a named prompt from the Cencori Prompt Registry.
     * When provided, the gateway resolves the active version and
     * injects it as the system message — no need to hardcode prompts.
     * 
     * @example
     * prompt: { name: 'support-agent', variables: { tier: 'pro' } }
     */
    prompt?: {
        /** Prompt name or slug as shown in the dashboard */
        name: string;
        /** Template variables to interpolate (e.g. {{tier}} → 'pro') */
        variables?: Record<string, string>;
    };
}

export interface ChatResponse {
    id: string;
    model: string;
    content: string;
    /** Tool calls made by the model */
    toolCalls?: ToolCall[];
    /** Finish reason */
    finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * Structured output request with JSON schema
 */
export interface GenerateObjectRequest {
    model: string;
    /** Text prompt for the model */
    prompt?: string;
    /** Messages for chat-style input */
    messages?: ChatMessage[];
    /** JSON Schema for the expected output */
    schema: Record<string, unknown>;
    /** Schema name for the model */
    schemaName?: string;
    /** Schema description */
    schemaDescription?: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * Structured output response
 */
export interface GenerateObjectResponse<T = unknown> {
    object: T;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface CompletionRequest {
    model: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
}

export interface EmbeddingRequest {
    model: string;
    input: string | string[];
}

export interface EmbeddingResponse {
    model: string;
    embeddings: number[][];
    usage: {
        totalTokens: number;
    };
}

/**
 * Image generation request
 */
export interface ImageGenerationRequest {
    /** Text prompt describing the image to generate */
    prompt: string;
    /** 
     * Model to use. Supported models:
     * - OpenAI: 'gpt-image-1.5', 'dall-e-3', 'dall-e-2'
     * - Google: 'gemini-3-pro-image', 'imagen-3'
     * Default: 'dall-e-3'
     */
    model?: string;
    /** Number of images to generate (default: 1) */
    n?: number;
    /** Image size (availability varies by model) */
    size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024' | '1536x1024' | '1024x1536';
    /** Image quality (DALL-E 3 / GPT Image only) */
    quality?: 'standard' | 'hd';
    /** Image style (DALL-E 3 only) */
    style?: 'vivid' | 'natural';
    /** Response format */
    responseFormat?: 'url' | 'b64_json';
}

/**
 * Generated image
 */
export interface GeneratedImage {
    /** URL to the generated image (if responseFormat is 'url') */
    url?: string;
    /** Base64 encoded image (if responseFormat is 'b64_json') */
    b64Json?: string;
    /** Revised prompt used by the model */
    revisedPrompt?: string;
}

/**
 * Image generation response
 */
export interface ImageGenerationResponse {
    images: GeneratedImage[];
    model: string;
    provider: string;
}

// ── Responses API (OpenAI-compatible) ──

/**
 * A content part on a message or a tool result. Text and images both travel this way; a tool that
 * returns an image — an agent's `view_image`, say — answers with parts rather than a string.
 */
export type ResponseContentPart =
    | { type: 'input_text' | 'output_text' | 'text'; text: string }
    | {
        type: 'input_image' | 'image_url';
        /** An https URL or a `data:` URL carrying the image bytes. */
        image_url: string | { url: string; detail?: 'auto' | 'low' | 'high' };
    };

/**
 * A response input item for the Responses API.
 * Can be a message, function call, or function call output.
 */
export type ResponseInputItem =
    | { type: 'message'; role: 'user' | 'assistant' | 'system'; content: string | ResponseContentPart[] }
    | { type: 'function_call'; id: string; call_id: string; name: string; arguments: string; status?: string }
    | { type: 'function_call_output'; call_id: string; output: string | ResponseContentPart[] }
    | { type: 'file'; filename: string; content: string; mime_type?: string };

/**
 * Built-in tool types for the Responses API
 */
export type WebSearchTool = {
    type: 'web_search_preview';
    search_context_size?: 'low' | 'medium' | 'high';
    user_location?: { type: 'approximate'; country?: string; city?: string; region?: string };
};

export type FileSearchTool = {
    type: 'file_search';
    max_num_results?: number;
    filters?: Record<string, unknown>;
};

export type CodeInterpreterTool = {
    type: 'code_interpreter';
};

/**
 * A tool in the Responses API
 */
export type ResponsesTool =
    | WebSearchTool
    | FileSearchTool
    | CodeInterpreterTool
    | ToolDefinition;

/**
 * Request for the Responses API
 */
export interface ResponsesRequest {
    model: string;
    input: string | ResponseInputItem[];
    instructions?: string;
    tools?: ResponsesTool[];
    tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
    temperature?: number;
    max_output_tokens?: number;
    top_p?: number;
    store?: boolean;
    metadata?: Record<string, string>;
    previous_response_id?: string;
    parallel_tool_calls?: boolean;
    truncation?: 'auto' | 'disabled';
    response_format?: {
        type: 'text' | 'json_object' | 'json_schema';
        json_schema?: { name: string; description?: string; schema: Record<string, unknown>; strict?: boolean };
    };
    include?: string[];
    stream?: boolean;
    user?: string;
}

/**
 * A single output item from a Responses API response
 */
export type UrlCitation = {
    type: 'url_citation';
    start_index: number;
    end_index: number;
    url: string;
    title?: string;
};

export interface ResponsesOutputItem {
    id: string;
    type: 'message' | 'function_call' | 'web_search_call' | 'file_search_call' | 'code_interpreter_call' | 'reasoning';
    status?: 'completed' | 'failed' | 'in_progress';
    role?: 'assistant';
    content?: Array<{ type: 'output_text' | 'refusal'; text?: string; annotations?: UrlCitation[] }>;
    call_id?: string;
    name?: string;
    arguments?: string;
    output?: Record<string, unknown>;
    error?: string;
}

/**
 * Response from the Responses API
 */
export interface ResponsesResponse {
    id: string;
    object: 'response';
    created: number;
    model: string;
    output: ResponsesOutputItem[];
    usage: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
    };
    status: 'completed' | 'failed' | 'in_progress';
    metadata?: Record<string, string>;
}

/**
 * Options for generic API requests
 */
export interface RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: string;
    headers?: Record<string, string>;
}

// Placeholder types for future products
export interface ComputeRunOptions {
    input?: Record<string, unknown>;
    timeout?: number;
}

export interface WorkflowTriggerOptions {
    data?: Record<string, unknown>;
    async?: boolean;
}

export interface VectorSearchOptions {
    limit?: number;
    filter?: Record<string, unknown>;
}

/**
 * Options for generic API requests
 */
export interface RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: string;
    headers?: Record<string, string>;
}

