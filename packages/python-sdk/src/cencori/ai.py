"""AI module for chat completions, embeddings, and streaming."""

import json
from typing import Any, Dict, Iterator, List, Optional, Union, TYPE_CHECKING

import httpx

from .errors import AuthenticationError, CencoriError, RateLimitError
from .types import (
    ChatResponse,
    EmbeddingResponse,
    EmbeddingUsage,
    GenerateObjectRequest,
    GenerateObjectResponse,
    GeneratedImage,
    ImageGenerationRequest,
    ImageGenerationResponse,
    RagRequest,
    RagResponse,
    RagSource,
    RagStreamChunk,
    ResponseContentPart,
    ResponsesOutputItem,
    ResponsesRequest,
    ResponsesResponse,
    ResponsesUsage,
    StreamChunk,
    ToolChoice,
    ToolDefinition,
    Usage,
)

if TYPE_CHECKING:
    from .client import Cencori


class AIModule:
    """
    AI module for chat completions, embeddings, and streaming.

    Provides access to OpenAI, Anthropic, and Google models through
    Cencori's unified API with built-in security, logging, and cost tracking.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    # =========================================================================
    # Chat Methods
    # =========================================================================

    def chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "gemini-2.5-flash",
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        user_id: Optional[str] = None,
        tools: Optional[List[ToolDefinition]] = None,
        tool_choice: Optional[ToolChoice] = None,
        prompt: Optional[Dict[str, Any]] = None,
    ) -> ChatResponse:
        """
        Send a chat completion request (non-streaming).

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: AI model to use (default: gemini-2.5-flash)
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens in response
            user_id: Optional user ID for rate limiting
            tools: Tool definitions for function calling
            tool_choice: How the model chooses to call tools
            prompt: Prompt Registry reference

        Returns:
            ChatResponse with content, usage, and cost
        """
        payload: Dict[str, Any] = {
            "messages": messages,
            "model": model,
            "stream": False,
        }

        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["maxTokens"] = max_tokens
        if user_id is not None:
            payload["userId"] = user_id
        if tools is not None:
            payload["tools"] = [t.__dict__ if hasattr(t, '__dict__') else t for t in tools]
        if tool_choice is not None:
            payload["toolChoice"] = tool_choice.__dict__ if hasattr(tool_choice, '__dict__') else tool_choice
        if prompt is not None:
            payload["prompt"] = prompt

        data = self._client._request("POST", "/api/ai/chat", json=payload)

        tool_calls = None
        if "toolCalls" in data and data["toolCalls"]:
            tool_calls = data["toolCalls"]
        elif "choices" in data and data["choices"]:
            choice = data["choices"][0]
            if "message" in choice and "tool_calls" in choice["message"]:
                tool_calls = choice["message"]["tool_calls"]

        return ChatResponse(
            id=data.get("id", ""),
            content=data.get("content", ""),
            model=data.get("model", model),
            provider=data.get("provider", ""),
            usage=Usage(
                prompt_tokens=data.get("usage", {}).get("prompt_tokens", 0),
                completion_tokens=data.get("usage", {}).get("completion_tokens", 0),
                total_tokens=data.get("usage", {}).get("total_tokens", 0),
            ),
            cost_usd=data.get("cost_usd", 0.0),
            finish_reason=data.get("finish_reason"),
            tool_calls=tool_calls,
        )

    def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: str = "gemini-2.5-flash",
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        user_id: Optional[str] = None,
        tools: Optional[List[ToolDefinition]] = None,
        tool_choice: Optional[ToolChoice] = None,
        prompt: Optional[Dict[str, Any]] = None,
    ) -> Iterator[StreamChunk]:
        """
        Send a chat completion request with streaming.
        """
        payload: Dict[str, Any] = {
            "messages": messages,
            "model": model,
            "stream": True,
        }

        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["maxTokens"] = max_tokens
        if user_id is not None:
            payload["userId"] = user_id
        if tools is not None:
            payload["tools"] = [t.__dict__ if hasattr(t, '__dict__') else t for t in tools]
        if tool_choice is not None:
            payload["toolChoice"] = tool_choice.__dict__ if hasattr(tool_choice, '__dict__') else tool_choice
        if prompt is not None:
            payload["prompt"] = prompt

        url = f"{self._client._base_url}/api/ai/chat"
        headers = {
            "Content-Type": "application/json",
            "CENCORI_API_KEY": self._client._api_key,
        }

        with httpx.Client(timeout=60.0) as http_client:
            with http_client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code == 401:
                    raise AuthenticationError()
                if response.status_code == 429:
                    raise RateLimitError()
                if not response.is_success:
                    raise CencoriError(f"Request failed with status {response.status_code}")

                for line in response.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue

                    data_str = line[6:]

                    if data_str == "[DONE]":
                        return

                    try:
                        data = json.loads(data_str)

                        if "error" in data:
                            yield StreamChunk(
                                delta="",
                                error=data.get("error"),
                            )
                            return

                        yield StreamChunk(
                            delta=data.get("delta", ""),
                            finish_reason=data.get("finish_reason"),
                            tool_calls=data.get("toolCalls"),
                        )
                    except json.JSONDecodeError:
                        continue

    # =========================================================================
    # Completions Method
    # =========================================================================

    def completions(
        self,
        prompt: str,
        model: str = "gemini-2.5-flash",
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> ChatResponse:
        """
        Create a text completion (wraps chat internally).
        """
        return self.chat(
            messages=[{"role": "user", "content": prompt}],
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    # =========================================================================
    # Embeddings Method
    # =========================================================================

    def embeddings(
        self,
        input: Union[str, List[str]],
        model: str = "text-embedding-3-small",
    ) -> EmbeddingResponse:
        """
        Generate embeddings for text.
        """
        payload: Dict[str, Any] = {
            "input": input,
            "model": model,
        }

        data = self._client._request("POST", "/api/v1/embeddings", json=payload)

        embeddings = [item["embedding"] for item in data.get("data", [])]

        return EmbeddingResponse(
            model=data.get("model", model),
            embeddings=embeddings,
            usage=EmbeddingUsage(
                total_tokens=data.get("usage", {}).get("total_tokens", 0),
            ),
        )

    # =========================================================================
    # Generate Object (Structured Output)
    # =========================================================================

    def generate_object(
        self,
        params: GenerateObjectRequest,
    ) -> GenerateObjectResponse:
        """
        Generate structured output matching a JSON schema.
        Uses function calling to enforce the schema on the model output.
        """
        messages = params.messages or [{"role": "user", "content": params.prompt or ""}]
        schema_name = params.schema_name or "generate_object"

        payload: Dict[str, Any] = {
            "model": params.model,
            "messages": [m.__dict__ if hasattr(m, '__dict__') else m for m in messages],
            "stream": False,
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": schema_name,
                        "description": params.schema_description or "Generate a structured object matching the schema",
                        "parameters": params.schema,
                    },
                }
            ],
            "toolChoice": {"type": "function", "function": {"name": schema_name}},
        }

        if params.temperature is not None:
            payload["temperature"] = params.temperature
        if params.max_tokens is not None:
            payload["maxTokens"] = params.max_tokens

        data = self._client._request("POST", "/api/ai/chat", json=payload)

        tool_calls = data.get("toolCalls") or data.get("tool_calls") or []
        if not tool_calls and "choices" in data:
            choice = data["choices"][0]
            if "message" in choice and "tool_calls" in choice["message"]:
                tool_calls = choice["message"]["tool_calls"]

        if not tool_calls:
            raise CencoriError("Model did not return structured output")

        try:
            parsed = json.loads(tool_calls[0]["function"]["arguments"])
        except (KeyError, json.JSONDecodeError):
            raise CencoriError("Failed to parse structured output as JSON")

        return GenerateObjectResponse(
            object=parsed,
            usage=Usage(
                prompt_tokens=data.get("usage", {}).get("prompt_tokens", 0),
                completion_tokens=data.get("usage", {}).get("completion_tokens", 0),
                total_tokens=data.get("usage", {}).get("total_tokens", 0),
            ),
        )

    # =========================================================================
    # Image Generation
    # =========================================================================

    def generate_image(
        self,
        prompt: str,
        model: str = "dall-e-3",
        n: Optional[int] = None,
        size: Optional[str] = None,
        quality: Optional[str] = None,
        style: Optional[str] = None,
        response_format: Optional[str] = None,
    ) -> ImageGenerationResponse:
        """
        Generate images from a text prompt.
        """
        payload: Dict[str, Any] = {
            "prompt": prompt,
            "model": model,
        }
        if n is not None:
            payload["n"] = n
        if size is not None:
            payload["size"] = size
        if quality is not None:
            payload["quality"] = quality
        if style is not None:
            payload["style"] = style
        if response_format is not None:
            payload["responseFormat"] = response_format

        data = self._client._request("POST", "/api/ai/images/generate", json=payload)

        images = [GeneratedImage(**img) for img in data.get("images", [])]

        return ImageGenerationResponse(
            images=images,
            model=data.get("model", model),
            provider=data.get("provider", ""),
        )

    # =========================================================================
    # RAG Methods
    # =========================================================================

    def rag(
        self,
        model: str,
        messages: List[Dict[str, str]],
        namespace: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        limit: int = 5,
        threshold: float = 0.5,
        include_sources: bool = True,
    ) -> RagResponse:
        """
        RAG (Retrieval-Augmented Generation) chat with automatic memory context.
        """
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "namespace": namespace,
            "limit": limit,
            "threshold": threshold,
            "include_sources": include_sources,
            "stream": False,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["maxTokens"] = max_tokens

        data = self._client._request("POST", "/api/ai/rag", json=payload)

        sources = None
        if "sources" in data and data["sources"]:
            sources = [RagSource(**s) for s in data["sources"]]

        return RagResponse(
            message={"role": "assistant", "content": data.get("message", {}).get("content", "")},
            model=data.get("model", model),
            provider=data.get("provider", ""),
            usage=Usage(
                prompt_tokens=data.get("usage", {}).get("prompt_tokens", 0),
                completion_tokens=data.get("usage", {}).get("completion_tokens", 0),
                total_tokens=data.get("usage", {}).get("total_tokens", 0),
            ),
            sources=sources,
            latency_ms=data.get("latency_ms", 0),
        )

    def rag_stream(
        self,
        model: str,
        messages: List[Dict[str, str]],
        namespace: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        limit: int = 5,
        threshold: float = 0.5,
        include_sources: bool = True,
    ) -> Iterator[RagStreamChunk]:
        """
        Stream RAG responses with automatic memory context.
        """
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "namespace": namespace,
            "limit": limit,
            "threshold": threshold,
            "include_sources": include_sources,
            "stream": True,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["maxTokens"] = max_tokens

        url = f"{self._client._base_url}/api/ai/rag"
        headers = {
            "Content-Type": "application/json",
            "CENCORI_API_KEY": self._client._api_key,
        }

        with httpx.Client(timeout=60.0) as http_client:
            with http_client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code == 401:
                    raise AuthenticationError()
                if response.status_code == 429:
                    raise RateLimitError()
                if not response.is_success:
                    raise CencoriError(f"Request failed with status {response.status_code}")

                for line in response.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue

                    data_str = line[6:]

                    if data_str == "[DONE]":
                        return

                    try:
                        data = json.loads(data_str)
                        sources = None
                        if "sources" in data and data["sources"]:
                            sources = [RagSource(**s) for s in data["sources"]]

                        yield RagStreamChunk(
                            type=data.get("type", "content"),
                            delta=data.get("delta"),
                            finish_reason=data.get("finish_reason"),
                            sources=sources,
                            error=data.get("error"),
                        )
                    except json.JSONDecodeError:
                        continue

    # =========================================================================
    # Responses API
    # =========================================================================

    def responses(
        self,
        request: ResponsesRequest,
    ) -> ResponsesResponse:
        """
        Send a request to the OpenAI-compatible Responses API.
        Supports built-in tools: web_search_preview, file_search, code_interpreter.
        """
        payload = request.__dict__ if hasattr(request, '__dict__') else request
        # Ensure stream is False for synchronous
        if isinstance(payload, dict):
            payload["stream"] = False

        data = self._client._request("POST", "/v1/responses", json=payload)

        output = []
        for item in data.get("output", []):
            content_parts = None
            if "content" in item and item["content"]:
                content_parts = [ResponseContentPart(**c) for c in item["content"]]
            output.append(ResponsesOutputItem(
                id=item.get("id", ""),
                type=item.get("type", ""),
                status=item.get("status"),
                role=item.get("role"),
                content=content_parts,
                call_id=item.get("call_id"),
                name=item.get("name"),
                arguments=item.get("arguments"),
                error=item.get("error"),
            ))

        return ResponsesResponse(
            id=data.get("id", ""),
            object=data.get("object", "response"),
            created=data.get("created", 0),
            model=data.get("model", ""),
            output=output,
            usage=ResponsesUsage(**data["usage"]) if "usage" in data else None,
            status=data.get("status", ""),
            metadata=data.get("metadata"),
        )

    def responses_stream(
        self,
        request: ResponsesRequest,
    ) -> Iterator[Dict[str, Any]]:
        """
        Stream responses from the Responses API via SSE.
        Yields dicts with 'type' and 'data' keys.
        """
        payload = request.__dict__ if hasattr(request, '__dict__') else request
        if isinstance(payload, dict):
            payload["stream"] = True

        url = f"{self._client._base_url}/v1/responses"
        headers = {
            "Content-Type": "application/json",
            "CENCORI_API_KEY": self._client._api_key,
        }

        with httpx.Client(timeout=60.0) as http_client:
            with http_client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code == 401:
                    raise AuthenticationError()
                if response.status_code == 429:
                    raise RateLimitError()
                if not response.is_success:
                    raise CencoriError(f"Request failed with status {response.status_code}")

                event_type = ""
                for line in response.iter_lines():
                    line = line.strip()
                    if not line:
                        event_type = ""
                        continue
                    if line.startswith("event: "):
                        event_type = line[7:].strip()
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if not data_str:
                            continue
                        try:
                            parsed = json.loads(data_str)
                            yield {"type": event_type or "message", "data": parsed}
                        except json.JSONDecodeError:
                            continue
                        event_type = ""

    # =========================================================================
    # Async Methods
    # =========================================================================

    async def async_chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "gemini-2.5-flash",
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        user_id: Optional[str] = None,
        tools: Optional[List[ToolDefinition]] = None,
        tool_choice: Optional[ToolChoice] = None,
        prompt: Optional[Dict[str, Any]] = None,
    ) -> ChatResponse:
        """Send a chat completion request asynchronously."""
        payload: Dict[str, Any] = {
            "messages": messages,
            "model": model,
            "stream": False,
        }

        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["maxTokens"] = max_tokens
        if user_id is not None:
            payload["userId"] = user_id
        if tools is not None:
            payload["tools"] = [t.__dict__ if hasattr(t, '__dict__') else t for t in tools]
        if tool_choice is not None:
            payload["toolChoice"] = tool_choice.__dict__ if hasattr(tool_choice, '__dict__') else tool_choice
        if prompt is not None:
            payload["prompt"] = prompt

        data = await self._client._async_request("POST", "/api/ai/chat", json=payload)

        return ChatResponse(
            content=data.get("content", ""),
            model=data.get("model", model),
            provider=data.get("provider", ""),
            usage=Usage(
                prompt_tokens=data.get("usage", {}).get("prompt_tokens", 0),
                completion_tokens=data.get("usage", {}).get("completion_tokens", 0),
                total_tokens=data.get("usage", {}).get("total_tokens", 0),
            ),
            cost_usd=data.get("cost_usd", 0.0),
            finish_reason=data.get("finish_reason"),
        )

    async def async_completions(
        self,
        prompt: str,
        model: str = "gemini-2.5-flash",
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> ChatResponse:
        """Create a text completion asynchronously."""
        return await self.async_chat(
            messages=[{"role": "user", "content": prompt}],
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    async def async_embeddings(
        self,
        input: Union[str, List[str]],
        model: str = "text-embedding-3-small",
    ) -> EmbeddingResponse:
        """Generate embeddings asynchronously."""
        payload: Dict[str, Any] = {
            "input": input,
            "model": model,
        }

        data = await self._client._async_request("POST", "/api/v1/embeddings", json=payload)

        embeddings = [item["embedding"] for item in data.get("data", [])]

        return EmbeddingResponse(
            model=data.get("model", model),
            embeddings=embeddings,
            usage=EmbeddingUsage(
                total_tokens=data.get("usage", {}).get("total_tokens", 0),
            ),
        )

    async def async_generate_object(
        self,
        params: GenerateObjectRequest,
    ) -> GenerateObjectResponse:
        """Generate structured output asynchronously."""
        return self.generate_object(params)

    async def async_generate_image(
        self,
        prompt: str,
        model: str = "dall-e-3",
        n: Optional[int] = None,
        size: Optional[str] = None,
        quality: Optional[str] = None,
        style: Optional[str] = None,
        response_format: Optional[str] = None,
    ) -> ImageGenerationResponse:
        """Generate images asynchronously."""
        return self.generate_image(prompt, model, n, size, quality, style, response_format)

    async def async_rag(
        self,
        model: str,
        messages: List[Dict[str, str]],
        namespace: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        limit: int = 5,
        threshold: float = 0.5,
        include_sources: bool = True,
    ) -> RagResponse:
        """RAG asynchronously."""
        return self.rag(model, messages, namespace, temperature, max_tokens, limit, threshold, include_sources)

    async def async_responses(
        self,
        request: ResponsesRequest,
    ) -> ResponsesResponse:
        """Responses API asynchronously."""
        return self.responses(request)
