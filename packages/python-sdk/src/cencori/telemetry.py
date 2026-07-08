"""Telemetry module for reporting web traffic."""

from typing import TYPE_CHECKING, Optional

from .types import WebTelemetryPayload

if TYPE_CHECKING:
    from .client import Cencori


class TelemetryModule:
    """
    Module for reporting web traffic to the Cencori dashboard.

    Logs appear under the project's "Web Gateway" tab with your app's
    real domain as the host. Fire-and-forget — never throws.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    def report_web_request(self, payload: WebTelemetryPayload) -> None:
        """
        Report a web request to the Cencori dashboard.

        Fire-and-forget — this method never throws. If the request fails,
        the error is silently swallowed.

        Args:
            payload: Web request details to log
        """
        try:
            self._client._request("POST", "/api/v1/telemetry/web", json=payload.__dict__)
        except Exception:
            pass
