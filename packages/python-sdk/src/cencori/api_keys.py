from typing import TYPE_CHECKING, List

from .types import APIKey, CreateAPIKeyParams, DailyStat, KeyUsageStats

if TYPE_CHECKING:
    from .client import Cencori


class APIKeysModule:
    """
    Module for managing Cencori API keys.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    def list(self, project_id: str, environment: str) -> List[APIKey]:
        """
        List API keys for a project.

        Args:
            project_id: The project ID
            environment: environment name (e.g., "production", "test")

        Returns:
            List of APIKey objects
        """
        path = f"/api/projects/{project_id}/api-keys?environment={environment}"
        data = self._client._request("GET", path)

        return [
            APIKey(
                id=k["id"],
                name=k["name"],
                environment=k["environment"],
                created_at=k["created_at"],
                prefix=k.get("prefix"),
                last_used_at=k.get("last_used_at"),
                usage_count=k.get("usage_count"),
            )
            for k in data.get("keys", [])
        ]

    def create(self, project_id: str, params: CreateAPIKeyParams) -> APIKey:
        """
        Create a new API key.

        Args:
            project_id: The project ID
            params: Creation parameters

        Returns:
            Created APIKey (includes the secret key string)
        """
        path = f"/api/projects/{project_id}/api-keys"
        payload = {
            "name": params.name,
            "environment": params.environment,
        }

        data = self._client._request("POST", path, json=payload)

        return APIKey(
            id=data["id"],
            name=data["name"],
            environment=data["environment"],
            created_at=data["created_at"],
            prefix=data.get("prefix"),
            key=data.get("key"),  # Secret key only returned on creation
            last_used_at=data.get("last_used_at"),
            usage_count=data.get("usage_count"),
        )

    def revoke(self, project_id: str, key_id: str) -> None:
        """
        Revoke (delete) an API key.

        Args:
            project_id: The project ID
            key_id: The API key ID
        """
        path = f"/api/projects/{project_id}/api-keys/{key_id}"
        self._client._request("DELETE", path)

    def get_stats(self, project_id: str, key_id: str) -> KeyUsageStats:
        """
        Get usage statistics for an API key.

        Args:
            project_id: The project ID
            key_id: The API key ID

        Returns:
            KeyUsageStats object with analytics
        """
        path = f"/api/projects/{project_id}/api-keys/{key_id}/stats"
        data = self._client._request("GET", path)

        return KeyUsageStats(
            key_id=data["key_id"],
            total_requests=data["total_requests"],
            total_cost_usd=data["total_cost_usd"],
            last_used_at=data["last_used_at"],
            requests_by_day=[
                DailyStat(date=d["date"], count=d["count"], cost_usd=d["cost_usd"])
                for d in data.get("requests_by_day", [])
            ],
            requests_by_model=data.get("requests_by_model", {}),
        )
