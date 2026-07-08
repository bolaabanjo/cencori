"""Pytest configuration and fixtures for Cencori SDK tests."""

from typing import Any, Dict, List

import httpx
import pytest


class MockTransport(httpx.BaseTransport):
    """Mock transport for httpx that returns predefined responses."""

    def __init__(self, responses: Dict[str, Any]) -> None:
        self.responses = responses
        self.requests: List[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)

        # Find matching response based on path
        path = request.url.path

        if path in self.responses:
            response_data = self.responses[path]

            if isinstance(response_data, dict) and "status_code" in response_data:
                return httpx.Response(
                    status_code=response_data["status_code"],
                    json=response_data.get("json", {}),
                )

            return httpx.Response(
                status_code=200,
                json=response_data,
            )

        return httpx.Response(status_code=404, json={"error": "Not found"})


@pytest.fixture
def mock_chat_response() -> Dict[str, Any]:
    """Standard chat response fixture."""
    return {
        "content": "Hello! How can I help you today?",
        "model": "gpt-4o",
        "provider": "openai",
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 15,
            "total_tokens": 25,
        },
        "cost_usd": 0.000125,
        "finish_reason": "stop",
    }


@pytest.fixture
def mock_embedding_response() -> Dict[str, Any]:
    """Standard embedding response fixture."""
    return {
        "model": "text-embedding-3-small",
        "data": [
            {"embedding": [0.1, 0.2, 0.3, 0.4, 0.5]},
        ],
        "usage": {
            "total_tokens": 5,
        },
    }


@pytest.fixture
def mock_error_responses() -> Dict[str, Dict[str, Any]]:
    """Error response fixtures."""
    return {
        "auth_error": {
            "status_code": 401,
            "json": {"error": "Invalid API key", "code": "INVALID_API_KEY"},
        },
        "rate_limit": {
            "status_code": 429,
            "json": {"error": "Rate limit exceeded", "code": "RATE_LIMIT_EXCEEDED"},
        },
        "safety_error": {
            "status_code": 400,
            "json": {
                "error": "Content blocked",
                "code": "SAFETY_VIOLATION",
                "reasons": ["harmful_content", "pii_detected"],
            },
        },
    }


@pytest.fixture
def api_key() -> str:
    """Test API key."""
    return "csk_test_12345678901234567890"


@pytest.fixture
def base_url() -> str:
    """Test base URL."""
    return "https://test.cencori.com"
