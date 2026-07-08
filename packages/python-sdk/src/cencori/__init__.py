"""
Cencori Python SDK

Official Python SDK for Cencori - AI Infrastructure for Production.

One SDK for AI Gateway, Compute, Workflow, and Storage.
Every operation is secured, logged, and tracked.
"""

from .client import Cencori
from .vision import VisionModule
from .documents import DocumentsModule
from .errors import (
    AuthenticationError,
    CencoriError,
    InsufficientCreditsError,
    ProviderError,
    RateLimitError,
    SafetyError,
)
from .types import (
    Agent,
    AgentConfig,
    AgentKey,
    AgentListItem,
    APIKey,
    Breakdown,
    ChatParams,
    ChatResponse,
    CompletionRequest,
    CostMetrics,
    CreateAgentKeyParams,
    CreateAgentParams,
    CreateAPIKeyParams,
    CreateNamespaceOptions,
    CreateProjectParams,
    DailyStat,
    EmbeddingRequest,
    EmbeddingResponse,
    EmbeddingUsage,
    GenerateObjectRequest,
    GenerateObjectResponse,
    GeneratedImage,
    ImageGenerationRequest,
    ImageGenerationResponse,
    KeyUsageStats,
    LatencyMetrics,
    Memory,
    MemoryNamespace,
    Message,
    MetricsResponse,
    Project,
    RagRequest,
    RagResponse,
    RagSource,
    RagStreamChunk,
    RequestMetrics,
    ResponseContentPart,
    ResponseInputItem,
    ResponsesOutputItem,
    ResponsesRequest,
    ResponsesResponse,
    ResponsesTool,
    ResponsesUsage,
    SearchMemoryOptions,
    SearchResult,
    Session,
    SessionEvent,
    Stats,
    StoreMemoryOptions,
    StreamChunk,
    TokenMetrics,
    ToolCall,
    ToolCallFunction,
    ToolChoice,
    ToolDefinition,
    ToolFunction,
    UpdateAgentParams,
    Usage,
    WebTelemetryPayload,
)

__version__ = "1.4.0"
__all__ = [
    "Cencori",
    "VisionModule",
    "DocumentsModule",
    # Errors
    "CencoriError",
    "AuthenticationError",
    "RateLimitError",
    "SafetyError",
    "InsufficientCreditsError",
    "ProviderError",
    # Chat / AI types
    "Message",
    "ChatParams",
    "ChatResponse",
    "StreamChunk",
    "Usage",
    "ToolDefinition",
    "ToolCall",
    "ToolCallFunction",
    "ToolChoice",
    "ToolFunction",
    # Completion
    "CompletionRequest",
    # Embedding
    "EmbeddingRequest",
    "EmbeddingResponse",
    "EmbeddingUsage",
    # Generate Object
    "GenerateObjectRequest",
    "GenerateObjectResponse",
    # Image Generation
    "ImageGenerationRequest",
    "ImageGenerationResponse",
    "GeneratedImage",
    # RAG
    "RagRequest",
    "RagResponse",
    "RagSource",
    "RagStreamChunk",
    # Responses API
    "ResponsesRequest",
    "ResponsesResponse",
    "ResponsesTool",
    "ResponsesUsage",
    "ResponsesOutputItem",
    "ResponseInputItem",
    "ResponseContentPart",
    # Agents
    "Agent",
    "AgentConfig",
    "AgentListItem",
    "AgentKey",
    "CreateAgentParams",
    "UpdateAgentParams",
    "CreateAgentKeyParams",
    # Memory
    "Memory",
    "MemoryNamespace",
    "CreateNamespaceOptions",
    "StoreMemoryOptions",
    "SearchMemoryOptions",
    "SearchResult",
    # Sessions
    "Session",
    "SessionEvent",
    # Telemetry
    "WebTelemetryPayload",
    # Projects / API Keys / Metrics
    "Project",
    "CreateProjectParams",
    "Stats",
    "APIKey",
    "CreateAPIKeyParams",
    "DailyStat",
    "KeyUsageStats",
    "MetricsResponse",
    "RequestMetrics",
    "CostMetrics",
    "TokenMetrics",
    "LatencyMetrics",
    "Breakdown",
]
