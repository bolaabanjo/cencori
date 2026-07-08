from typing import TYPE_CHECKING

from .types import (
    Breakdown,
    CostMetrics,
    LatencyMetrics,
    MetricsResponse,
    RequestMetrics,
    TokenMetrics,
)

if TYPE_CHECKING:
    from .client import Cencori


class MetricsModule:
    """
    Module for fetching Cencori usage metrics.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    def get(self, period: str) -> MetricsResponse:
        """
        Get metrics for a specific period.

        Args:
            period: Time period (e.g., "24h", "7d", "30d")

        Returns:
            MetricsResponse object
        """
        path = f"/api/v1/metrics/{period}"
        data = self._client._request("GET", path)

        return MetricsResponse(
            period=data["period"],
            start_date=data["start_date"],
            end_date=data["end_date"],
            requests=RequestMetrics(**data["requests"]),
            cost=CostMetrics(**data["cost"]),
            tokens=TokenMetrics(**data["tokens"]),
            latency=LatencyMetrics(**data["latency"]),
            providers={k: Breakdown(**v) for k, v in data.get("providers", {}).items()},
            models={k: Breakdown(**v) for k, v in data.get("models", {}).items()},
        )
