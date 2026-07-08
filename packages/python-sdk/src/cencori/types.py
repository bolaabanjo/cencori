"""Type definitions for Cencori SDK."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Union


# ── Chat Types ──

MessageContent = Union[
    Dict[str, Any],  # {"type": "text", "text": "..."} or {"type": "image_url", "image_url": {...}}
]


@dataclass
class Message:
    """A chat message."""

    role: Literal["system", "user", "assistant", "tool"]
    content: str
    tool_call_id: Optional[str] = None
    tool_calls: Optional[List["ToolCall"]] = None


@dataclass
class ToolCall:
    """A tool call made by the model."""

    id: str
    type: str = "function"
    function: Optional["ToolCallFunction"] = None


@dataclass
class ToolCallFunction:
    """Function details in a tool call."""

    name: str
    arguments: str


@dataclass
class ToolDefinition:
    """Tool/function definition for AI models."""

    type: str = "function"
    function: Optional["ToolFunction"] = None


@dataclass
class ToolFunction:
    """Function definition within a tool."""

    name: str
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


@dataclass
class ToolChoice:
    """Tool choice configuration."""

    type: str = "auto"
    function: Optional[Dict[str, str]] = None


@dataclass
class PromptReference:
    """Reference to a prompt in the Cencori Prompt Registry."""

    name: str
    variables: Optional[Dict[str, str]] = None


@dataclass
class ChatParams:
    """Parameters for chat completion."""

    messages: List[Message]
    model: str = "gemini-2.5-flash"
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    stream: bool = False
    user_id: Optional[str] = None
    tools: Optional[List[ToolDefinition]] = None
    tool_choice: Optional[ToolChoice] = None
    prompt: Optional[PromptReference] = None


@dataclass
class Usage:
    """Token usage statistics."""

    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


@dataclass
class ChatResponse:
    """Response from chat completion."""

    id: str = ""
    content: str = ""
    model: str = ""
    provider: str = ""
    usage: Optional[Usage] = None
    cost_usd: float = 0.0
    finish_reason: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None


@dataclass
class StreamChunk:
    """A chunk from streaming response."""

    delta: str = ""
    finish_reason: Optional[str] = None
    error: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None


# ── Completion Types ──

@dataclass
class CompletionRequest:
    """Parameters for text completion."""

    prompt: str
    model: str = "gemini-2.5-flash"
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


# ── Embedding Types ──

@dataclass
class EmbeddingRequest:
    """Parameters for embedding generation."""

    input: Union[str, List[str]]
    model: str = "text-embedding-3-small"


@dataclass
class EmbeddingUsage:
    """Token usage for embeddings."""

    total_tokens: int


@dataclass
class EmbeddingResponse:
    """Response from embedding generation."""

    model: str
    embeddings: List[List[float]]
    usage: EmbeddingUsage


# ── Generate Object (Structured Output) Types ──

@dataclass
class GenerateObjectRequest:
    """Request for structured output generation."""

    model: str
    prompt: Optional[str] = None
    messages: Optional[List[Message]] = None
    schema: Optional[Dict[str, Any]] = None
    schema_name: Optional[str] = None
    schema_description: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


@dataclass
class GenerateObjectResponse:
    """Response from structured output generation."""

    object: Optional[Dict[str, Any]] = None
    usage: Optional[Usage] = None


# ── Image Generation Types ──

@dataclass
class ImageGenerationRequest:
    """Request for image generation."""

    prompt: str
    model: str = "dall-e-3"
    n: Optional[int] = None
    size: Optional[str] = None
    quality: Optional[str] = None
    style: Optional[str] = None
    response_format: Optional[str] = None


@dataclass
class GeneratedImage:
    """A generated image."""

    url: Optional[str] = None
    b64_json: Optional[str] = None
    revised_prompt: Optional[str] = None


@dataclass
class ImageGenerationResponse:
    """Response from image generation."""

    images: List[GeneratedImage] = field(default_factory=list)
    model: str = ""
    provider: str = ""


# ── RAG Types ──

@dataclass
class RagRequest:
    """Request for RAG (Retrieval-Augmented Generation)."""

    model: str
    messages: List[Message]
    namespace: str
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    limit: int = 5
    threshold: float = 0.5
    include_sources: bool = True
    stream: bool = False


@dataclass
class RagSource:
    """A source document from RAG retrieval."""

    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    similarity: float = 0.0


@dataclass
class RagResponse:
    """Response from RAG."""

    message: Optional[Message] = None
    model: str = ""
    provider: str = ""
    usage: Optional[Usage] = None
    sources: Optional[List[RagSource]] = None
    latency_ms: int = 0


@dataclass
class RagStreamChunk:
    """A chunk from RAG streaming."""

    type: str = ""
    delta: Optional[str] = None
    finish_reason: Optional[str] = None
    sources: Optional[List[RagSource]] = None
    error: Optional[str] = None


# ── Responses API Types ──

@dataclass
class ResponseInputItem:
    """An input item for the Responses API."""

    type: str
    role: Optional[str] = None
    content: Optional[str] = None
    call_id: Optional[str] = None
    name: Optional[str] = None
    arguments: Optional[str] = None
    output: Optional[str] = None
    status: Optional[str] = None
    filename: Optional[str] = None
    mime_type: Optional[str] = None


@dataclass
class ResponsesTool:
    """A tool for the Responses API."""

    type: str
    search_context_size: Optional[str] = None
    max_num_results: Optional[int] = None
    function: Optional[ToolFunction] = None


@dataclass
class ResponsesRequest:
    """Request for the OpenAI-compatible Responses API."""

    model: str
    input: Union[str, List[ResponseInputItem]]
    instructions: Optional[str] = None
    tools: Optional[List[ResponsesTool]] = None
    tool_choice: Optional[Any] = None
    temperature: Optional[float] = None
    max_output_tokens: Optional[int] = None
    top_p: Optional[float] = None
    store: Optional[bool] = None
    metadata: Optional[Dict[str, str]] = None
    previous_response_id: Optional[str] = None
    parallel_tool_calls: Optional[bool] = None
    truncation: Optional[str] = None
    response_format: Optional[Dict[str, Any]] = None
    include: Optional[List[str]] = None
    stream: bool = False
    user: Optional[str] = None


@dataclass
class ResponseContentPart:
    """A content part within a Responses API output item."""

    type: str = ""
    text: Optional[str] = None
    annotations: Optional[List[Any]] = None


@dataclass
class ResponsesOutputItem:
    """An output item from the Responses API."""

    id: str = ""
    type: str = ""
    status: Optional[str] = None
    role: Optional[str] = None
    content: Optional[List[ResponseContentPart]] = None
    call_id: Optional[str] = None
    name: Optional[str] = None
    arguments: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ResponsesUsage:
    """Token usage for Responses API."""

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


@dataclass
class ResponsesResponse:
    """Response from the Responses API."""

    id: str = ""
    object: str = "response"
    created: int = 0
    model: str = ""
    output: List[ResponsesOutputItem] = field(default_factory=list)
    usage: Optional[ResponsesUsage] = None
    status: str = ""
    metadata: Optional[Dict[str, str]] = None


# ── Agent Types ──

@dataclass
class AgentConfig:
    """Configuration for an AI agent."""

    model: str = ""
    system_prompt: Optional[str] = None
    tools: Optional[List[str]] = None
    temperature: Optional[float] = None


@dataclass
class Agent:
    """An AI agent."""

    id: str = ""
    name: str = ""
    description: Optional[str] = None
    is_active: bool = True
    shadow_mode: bool = False
    created_at: str = ""
    updated_at: Optional[str] = None
    config: Optional[AgentConfig] = None


@dataclass
class AgentListItem:
    """Lightweight agent info for list views."""

    id: str = ""
    name: str = ""
    description: Optional[str] = None
    is_active: bool = True
    shadow_mode: bool = False
    created_at: str = ""


@dataclass
class CreateAgentParams:
    """Parameters for creating an agent."""

    name: str
    description: Optional[str] = None
    config: Optional[AgentConfig] = None


@dataclass
class UpdateAgentParams:
    """Parameters for updating an agent."""

    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    shadow_mode: Optional[bool] = None
    config: Optional[AgentConfig] = None


@dataclass
class CreateAgentKeyParams:
    """Parameters for creating an agent API key."""

    name: Optional[str] = None
    environment: Optional[str] = None
    key_type: Optional[str] = None
    allowed_domains: Optional[List[str]] = None


@dataclass
class AgentKey:
    """An API key for an agent."""

    id: str = ""
    name: str = ""
    key_prefix: str = ""
    full_key: Optional[str] = None
    environment: str = ""
    key_type: str = ""
    agent_id: str = ""
    created_at: str = ""


# ── Memory Types ──

@dataclass
class MemoryNamespace:
    """A memory namespace for vector storage."""

    id: str = ""
    name: str = ""
    description: Optional[str] = None
    embedding_model: str = ""
    dimensions: int = 0
    metadata: Optional[Dict[str, Any]] = None
    memory_count: Optional[int] = None
    created_at: str = ""


@dataclass
class CreateNamespaceOptions:
    """Options for creating a memory namespace."""

    name: str
    description: Optional[str] = None
    embedding_model: Optional[str] = None
    dimensions: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class Memory:
    """A stored memory."""

    id: str = ""
    namespace: str = ""
    content: str = ""
    metadata: Optional[Dict[str, Any]] = None
    similarity: Optional[float] = None
    expires_at: Optional[str] = None
    created_at: str = ""
    updated_at: Optional[str] = None


@dataclass
class StoreMemoryOptions:
    """Options for storing a memory."""

    namespace: str
    content: str
    embedding: Optional[List[float]] = None
    metadata: Optional[Dict[str, Any]] = None
    expires_at: Optional[str] = None


@dataclass
class SearchMemoryOptions:
    """Options for searching memories."""

    namespace: str
    query: str
    limit: Optional[int] = None
    threshold: Optional[float] = None
    filter: Optional[Dict[str, Any]] = None


@dataclass
class SearchResult:
    """Result from a memory search."""

    results: List[Memory] = field(default_factory=list)
    query: str = ""
    namespace: str = ""
    count: int = 0
    latency_ms: int = 0


# ── Session Types ──

@dataclass
class Session:
    """A durable execution session."""

    id: str = ""
    status: str = ""
    turn_count: int = 0
    created_at: str = ""
    updated_at: str = ""
    agent_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    total_cost: float = 0.0


@dataclass
class SessionEvent:
    """An event within a session."""

    id: str = ""
    session_id: str = ""
    turn_number: int = 0
    sequence: int = 0
    event_type: str = ""
    payload: Optional[Dict[str, Any]] = None
    created_at: str = ""


@dataclass
class CreateSessionParams:
    """Parameters for creating a session."""

    agent_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class TurnParams:
    """Parameters for submitting a turn in a session."""

    input: Union[str, List[Dict[str, Any]]]
    tools: Optional[List[Dict[str, Any]]] = None
    instructions: Optional[str] = None
    agent_id: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_output_tokens: Optional[int] = None
    tool_choice: Optional[Any] = None
    response_format: Optional[Dict[str, Any]] = None
    user: Optional[str] = None
    pause_on_tool_calls: Optional[bool] = None


@dataclass
class ApproveRejectParams:
    """Parameters for approving or rejecting a session action."""

    action_id: str
    tool_results: Optional[List[Dict[str, str]]] = None


@dataclass
class Pagination:
    """Pagination info."""

    page: int = 0
    limit: int = 0
    total: int = 0
    total_pages: int = 0


@dataclass
class PaginatedResponse:
    """Paginated list response."""

    data: Optional[List[Any]] = None
    pagination: Optional[Pagination] = None


@dataclass
class SessionListItem:
    """Session in a list response."""

    id: str = ""
    status: str = ""
    turn_count: int = 0
    created_at: str = ""
    updated_at: str = ""
    agent_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    total_cost: float = 0.0


@dataclass
class SessionListParams:
    """Parameters for listing sessions."""

    page: Optional[int] = None
    limit: Optional[int] = None
    status: Optional[str] = None
    agent_id: Optional[str] = None


# ── Telemetry Types ──

@dataclass
class WebTelemetryPayload:
    """Payload for reporting a web request."""

    host: str
    method: str
    path: str
    status_code: int
    request_id: Optional[str] = None
    query_string: Optional[str] = None
    message: Optional[str] = None
    user_agent: Optional[str] = None
    referer: Optional[str] = None
    ip_address: Optional[str] = None
    country_code: Optional[str] = None
    latency_ms: Optional[int] = None


# ── Project Types ──

@dataclass
class Project:
    """A Cencori project."""

    id: str
    name: str
    slug: str
    description: str
    status: str
    visibility: str
    created_at: str
    updated_at: str
    stats: Optional["Stats"] = None


@dataclass
class CreateProjectParams:
    """Parameters for creating a project."""

    name: str
    description: Optional[str] = None
    visibility: Optional[str] = None


@dataclass
class Stats:
    """Project statistics."""

    total_requests: int
    total_cost_usd: float
    last_used_at: Optional[str] = None


# ── API Key Types ──

@dataclass
class APIKey:
    """A Cencori API key."""

    id: str
    name: str
    environment: str
    created_at: str
    prefix: Optional[str] = None
    key: Optional[str] = None
    last_used_at: Optional[str] = None
    usage_count: Optional[int] = None


@dataclass
class CreateAPIKeyParams:
    """Parameters for creating an API key."""

    name: str
    environment: str


@dataclass
class DailyStat:
    """Daily usage statistic."""

    date: str
    count: int
    cost_usd: float


@dataclass
class KeyUsageStats:
    """Usage statistics for an API key."""

    key_id: str
    total_requests: int
    total_cost_usd: float
    last_used_at: str
    requests_by_day: List[DailyStat]
    requests_by_model: Dict[str, int]


# ── Metrics Types ──

@dataclass
class RequestMetrics:
    total: int
    success: int
    error: int
    filtered: int
    success_rate: float


@dataclass
class CostMetrics:
    total_usd: float
    average_per_request_usd: float


@dataclass
class TokenMetrics:
    prompt: int
    completion: int
    total: int


@dataclass
class LatencyMetrics:
    avg_ms: int
    p50_ms: int
    p90_ms: int
    p99_ms: int


@dataclass
class Breakdown:
    requests: int
    cost_usd: float


@dataclass
class MetricsResponse:
    """Response from metrics API."""

    period: str
    start_date: str
    end_date: str
    requests: RequestMetrics
    cost: CostMetrics
    tokens: TokenMetrics
    latency: LatencyMetrics
    providers: Dict[str, Breakdown]
    models: Dict[str, Breakdown]
