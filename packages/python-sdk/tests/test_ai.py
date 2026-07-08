"""Tests for AI module."""

from typing import Any, Dict
from unittest.mock import patch

import pytest

from cencori import Cencori
from cencori.errors import AuthenticationError, RateLimitError, SafetyError


class TestChat:
    """Test chat method."""

    def test_chat_returns_response(self, api_key: str, mock_chat_response: Dict[str, Any]) -> None:
        """Test chat returns a ChatResponse."""
        client = Cencori(api_key=api_key)

        with patch.object(client, "_request", return_value=mock_chat_response):
            response = client.ai.chat(
                messages=[{"role": "user", "content": "Hello!"}],
                model="gpt-4o",
            )

        assert response.content == "Hello! How can I help you today?"
        assert response.model == "gpt-4o"
        assert response.provider == "openai"
        assert response.usage.total_tokens == 25
        assert response.cost_usd == 0.000125
        assert response.finish_reason == "stop"

    def test_chat_with_temperature(self, api_key: str, mock_chat_response: Dict[str, Any]) -> None:
        """Test chat with temperature parameter."""
        client = Cencori(api_key=api_key)

        with patch.object(client, "_request", return_value=mock_chat_response) as mock:
            client.ai.chat(
                messages=[{"role": "user", "content": "Hello!"}],
                temperature=0.7,
            )

        call_args = mock.call_args
        assert call_args[1]["json"]["temperature"] == 0.7

    def test_chat_with_max_tokens(self, api_key: str, mock_chat_response: Dict[str, Any]) -> None:
        """Test chat with max_tokens parameter."""
        client = Cencori(api_key=api_key)

        with patch.object(client, "_request", return_value=mock_chat_response) as mock:
            client.ai.chat(
                messages=[{"role": "user", "content": "Hello!"}],
                max_tokens=100,
            )

        call_args = mock.call_args
        assert call_args[1]["json"]["maxTokens"] == 100


class TestCompletions:
    """Test completions method."""

    def test_completions_wraps_chat(self, api_key: str, mock_chat_response: Dict[str, Any]) -> None:
        """Test completions internally calls chat."""
        client = Cencori(api_key=api_key)

        with patch.object(client, "_request", return_value=mock_chat_response) as mock:
            response = client.ai.completions(
                prompt="Write a haiku",
                model="gpt-4o",
            )

        call_args = mock.call_args
        messages = call_args[1]["json"]["messages"]

        assert len(messages) == 1
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Write a haiku"
        assert response.content == mock_chat_response["content"]


class TestEmbeddings:
    """Test embeddings method."""

    def test_embeddings_single_input(
        self, api_key: str, mock_embedding_response: Dict[str, Any]
    ) -> None:
        """Test embeddings with single input."""
        client = Cencori(api_key=api_key)

        with patch.object(client, "_request", return_value=mock_embedding_response):
            response = client.ai.embeddings(
                input="Hello world",
                model="text-embedding-3-small",
            )

        assert response.model == "text-embedding-3-small"
        assert len(response.embeddings) == 1
        assert response.embeddings[0] == [0.1, 0.2, 0.3, 0.4, 0.5]
        assert response.usage.total_tokens == 5

    def test_embeddings_multiple_inputs(self, api_key: str) -> None:
        """Test embeddings with multiple inputs."""
        client = Cencori(api_key=api_key)

        multi_response = {
            "model": "text-embedding-3-small",
            "data": [
                {"embedding": [0.1, 0.2, 0.3]},
                {"embedding": [0.4, 0.5, 0.6]},
            ],
            "usage": {"total_tokens": 10},
        }

        with patch.object(client, "_request", return_value=multi_response):
            response = client.ai.embeddings(
                input=["Hello", "World"],
            )

        assert len(response.embeddings) == 2


class TestErrorHandling:
    """Test error handling."""

    def test_authentication_error(self, api_key: str) -> None:
        """Test AuthenticationError is raised for 401."""
        client = Cencori(api_key=api_key)

        with patch.object(client, "_request", side_effect=AuthenticationError()):
            with pytest.raises(AuthenticationError):
                client.ai.chat(messages=[{"role": "user", "content": "Hi"}])

    def test_rate_limit_error(self, api_key: str) -> None:
        """Test RateLimitError is raised for 429."""
        client = Cencori(api_key=api_key)

        with patch.object(client, "_request", side_effect=RateLimitError()):
            with pytest.raises(RateLimitError):
                client.ai.chat(messages=[{"role": "user", "content": "Hi"}])

    def test_safety_error(self, api_key: str) -> None:
        """Test SafetyError is raised for content violations."""
        client = Cencori(api_key=api_key)

        with patch.object(client, "_request", side_effect=SafetyError(reasons=["harmful_content"])):
            with pytest.raises(SafetyError) as exc_info:
                client.ai.chat(messages=[{"role": "user", "content": "Bad content"}])

            assert "harmful_content" in exc_info.value.reasons
