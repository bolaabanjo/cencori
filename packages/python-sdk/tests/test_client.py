"""Tests for Cencori client."""

import os
from unittest.mock import patch

import pytest

from cencori import Cencori


class TestClientInitialization:
    """Test client initialization."""

    def test_init_with_api_key(self, api_key: str) -> None:
        """Test initialization with explicit API key."""
        client = Cencori(api_key=api_key)

        assert client._api_key == api_key
        assert client._base_url == "https://cencori.com"
        assert client._timeout == 30.0

    def test_init_with_env_var(self, api_key: str) -> None:
        """Test initialization from environment variable."""
        with patch.dict(os.environ, {"CENCORI_API_KEY": api_key}):
            client = Cencori()
            assert client._api_key == api_key

    def test_init_with_custom_base_url(self, api_key: str, base_url: str) -> None:
        """Test initialization with custom base URL."""
        client = Cencori(api_key=api_key, base_url=base_url)

        assert client._base_url == base_url

    def test_init_with_custom_timeout(self, api_key: str) -> None:
        """Test initialization with custom timeout."""
        client = Cencori(api_key=api_key, timeout=60.0)

        assert client._timeout == 60.0

    def test_init_without_api_key_raises(self) -> None:
        """Test that initialization without API key raises error."""
        with patch.dict(os.environ, {}, clear=True):
            # Remove CENCORI_API_KEY if it exists
            os.environ.pop("CENCORI_API_KEY", None)

            with pytest.raises(ValueError, match="API key is required"):
                Cencori()

    def test_trailing_slash_removed(self, api_key: str) -> None:
        """Test that trailing slash is removed from base URL."""
        client = Cencori(api_key=api_key, base_url="https://cencori.com/")

        assert client._base_url == "https://cencori.com"


class TestClientModules:
    """Test that all modules are initialized."""

    def test_ai_module_exists(self, api_key: str) -> None:
        """Test AI module is initialized."""
        client = Cencori(api_key=api_key)
        assert hasattr(client, "ai")

    def test_compute_module_exists(self, api_key: str) -> None:
        """Test compute module is initialized."""
        client = Cencori(api_key=api_key)
        assert hasattr(client, "compute")

    def test_workflow_module_exists(self, api_key: str) -> None:
        """Test workflow module is initialized."""
        client = Cencori(api_key=api_key)
        assert hasattr(client, "workflow")

    def test_storage_module_exists(self, api_key: str) -> None:
        """Test storage module is initialized."""
        client = Cencori(api_key=api_key)
        assert hasattr(client, "storage")

    def test_agents_module_exists(self, api_key: str) -> None:
        """Test agents module is initialized."""
        client = Cencori(api_key=api_key)
        assert hasattr(client, "agents")

    def test_memory_module_exists(self, api_key: str) -> None:
        """Test memory module is initialized."""
        client = Cencori(api_key=api_key)
        assert hasattr(client, "memory")

    def test_sessions_module_exists(self, api_key: str) -> None:
        """Test sessions module is initialized."""
        client = Cencori(api_key=api_key)
        assert hasattr(client, "sessions")

    def test_telemetry_module_exists(self, api_key: str) -> None:
        """Test telemetry module is initialized."""
        client = Cencori(api_key=api_key)
        assert hasattr(client, "telemetry")


class TestComingSoonModules:
    """Test that coming soon modules raise NotImplementedError."""

    def test_compute_run_raises(self, api_key: str) -> None:
        """Test compute.run raises NotImplementedError."""
        client = Cencori(api_key=api_key)

        with pytest.raises(NotImplementedError, match="coming soon"):
            client.compute.run("test-function")

    def test_workflow_trigger_raises(self, api_key: str) -> None:
        """Test workflow.trigger raises NotImplementedError."""
        client = Cencori(api_key=api_key)

        with pytest.raises(NotImplementedError, match="coming soon"):
            client.workflow.trigger("test-workflow")

    def test_storage_vectors_search_raises(self, api_key: str) -> None:
        """Test storage.vectors.search raises NotImplementedError."""
        client = Cencori(api_key=api_key)

        with pytest.raises(NotImplementedError, match="coming soon"):
            client.storage.vectors.search("test query")


class TestUtilityMethods:
    """Test utility methods."""

    def test_get_base_url(self, api_key: str) -> None:
        """Test get_base_url method."""
        client = Cencori(api_key=api_key)
        assert client.get_base_url() == "https://cencori.com"

    def test_get_api_key(self, api_key: str) -> None:
        """Test get_api_key method."""
        client = Cencori(api_key=api_key)
        assert client.get_api_key() == api_key

    def test_get_config_masks_api_key(self, api_key: str) -> None:
        """Test get_config masks the API key."""
        client = Cencori(api_key=api_key)
        config = client.get_config()

        assert "base_url" in config
        assert "api_key_hint" in config
        assert "..." in config["api_key_hint"]
        assert api_key not in config["api_key_hint"]
