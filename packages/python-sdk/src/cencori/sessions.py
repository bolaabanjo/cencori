"""Sessions module for durable execution sessions."""

from typing import TYPE_CHECKING, Any, Dict, List, Optional

import httpx

from .types import (
    ApproveRejectParams,
    CreateSessionParams,
    Pagination,
    Session,
    SessionEvent,
    SessionListParams,
    TurnParams,
)

if TYPE_CHECKING:
    from .client import Cencori


class SessionsModule:
    """
    Module for managing durable execution sessions for AI agents with pause/resume and event sourcing.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    def create(self, params: Optional[CreateSessionParams] = None) -> Session:
        """
        Create a new session.

        Args:
            params: Session creation parameters

        Returns:
            Created Session
        """
        payload: Dict[str, Any] = {}
        if params is not None:
            if params.agent_id is not None:
                payload["agent_id"] = params.agent_id
            if params.metadata is not None:
                payload["metadata"] = params.metadata

        data = self._client._request("POST", "/v1/sessions", json=payload or None)
        return self._parse_session(data)

    def list(self, params: Optional[SessionListParams] = None) -> Dict[str, Any]:
        """
        List sessions with optional filtering.

        Args:
            params: Filtering and pagination params

        Returns:
            Dict with 'data' list and 'pagination'
        """
        path = "/v1/sessions"
        if params is not None:
            query = []
            if params.page is not None:
                query.append(f"page={params.page}")
            if params.limit is not None:
                query.append(f"limit={params.limit}")
            if params.status is not None:
                query.append(f"status={params.status}")
            if params.agent_id is not None:
                query.append(f"agent_id={params.agent_id}")
            if query:
                path += "?" + "&".join(query)

        data = self._client._request("GET", path)
        pagination = None
        if "pagination" in data:
            p = data["pagination"]
            pagination = Pagination(
                page=p.get("page", 0),
                limit=p.get("limit", 0),
                total=p.get("total", 0),
                total_pages=p.get("total_pages", 0),
            )
        return {
            "data": [self._parse_session(s) for s in data.get("data", [])],
            "pagination": pagination,
        }

    def get(self, session_id: str) -> Session:
        """
        Get a session by ID.

        Args:
            session_id: The session ID

        Returns:
            Session object
        """
        data = self._client._request("GET", f"/v1/sessions/{session_id}")
        return self._parse_session(data)

    def delete(self, session_id: str) -> Dict[str, Any]:
        """
        Delete a session by ID.

        Args:
            session_id: The session ID

        Returns:
            Response with id and deleted status
        """
        return self._client._request("DELETE", f"/v1/sessions/{session_id}")

    def submit_turn(self, session_id: str, params: TurnParams) -> httpx.Response:
        """
        Submit a turn in a session. Returns raw HTTP response for streaming support.

        Args:
            session_id: The session ID
            params: Turn parameters

        Returns:
            httpx.Response object (body can be streamed)
        """
        url = f"{self._client._base_url}/v1/sessions/{session_id}/turns"
        headers = {
            "Content-Type": "application/json",
            "CENCORI_API_KEY": self._client._api_key,
        }

        payload = self._turn_params_to_dict(params)
        client = httpx.Client(timeout=self._client._timeout)
        response = client.request("POST", url, json=payload, headers=headers)
        return response

    def get_events(
        self,
        session_id: str,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        turn_number: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get events for a session.

        Args:
            session_id: The session ID
            page: Page number
            limit: Items per page
            turn_number: Filter by turn number

        Returns:
            Dict with 'data' list and 'pagination'
        """
        path = f"/v1/sessions/{session_id}/events"
        query = []
        if page is not None:
            query.append(f"page={page}")
        if limit is not None:
            query.append(f"limit={limit}")
        if turn_number is not None:
            query.append(f"turn_number={turn_number}")
        if query:
            path += "?" + "&".join(query)

        data = self._client._request("GET", path)
        pagination = None
        if "pagination" in data:
            p = data["pagination"]
            pagination = Pagination(
                page=p.get("page", 0),
                limit=p.get("limit", 0),
                total=p.get("total", 0),
                total_pages=p.get("total_pages", 0),
            )
        return {
            "data": [
                SessionEvent(
                    id=e.get("id", ""),
                    session_id=e.get("session_id", ""),
                    turn_number=e.get("turn_number", 0),
                    sequence=e.get("sequence", 0),
                    event_type=e.get("event_type", ""),
                    payload=e.get("payload"),
                    created_at=e.get("created_at", ""),
                )
                for e in data.get("data", [])
            ],
            "pagination": pagination,
        }

    def approve(self, session_id: str, params: ApproveRejectParams) -> httpx.Response:
        """
        Approve a pending action in a session. Returns raw HTTP response for streaming.

        Args:
            session_id: The session ID
            params: Approve parameters

        Returns:
            httpx.Response object
        """
        url = f"{self._client._base_url}/v1/sessions/{session_id}/approve"
        headers = {
            "Content-Type": "application/json",
            "CENCORI_API_KEY": self._client._api_key,
        }
        payload: Dict[str, Any] = {"action_id": params.action_id}
        if params.tool_results is not None:
            payload["tool_results"] = params.tool_results

        client = httpx.Client(timeout=self._client._timeout)
        response = client.request("POST", url, json=payload, headers=headers)
        return response

    def reject(self, session_id: str, params: ApproveRejectParams) -> Dict[str, Any]:
        """
        Reject a pending action in a session.

        Args:
            session_id: The session ID
            params: Reject parameters

        Returns:
            Response with id, action_id, resolution, status
        """
        payload: Dict[str, Any] = {"action_id": params.action_id}
        if params.tool_results is not None:
            payload["tool_results"] = params.tool_results

        return self._client._request("POST", f"/v1/sessions/{session_id}/reject", json=payload)

    def _parse_session(self, data: Dict[str, Any]) -> Session:
        return Session(
            id=data.get("id", ""),
            status=data.get("status", ""),
            turn_count=data.get("turn_count", 0),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            agent_id=data.get("agent_id"),
            metadata=data.get("metadata"),
            total_cost=data.get("total_cost", 0.0),
        )

    def _turn_params_to_dict(self, params: TurnParams) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"input": params.input}
        if params.tools is not None:
            payload["tools"] = params.tools
        if params.instructions is not None:
            payload["instructions"] = params.instructions
        if params.agent_id is not None:
            payload["agent_id"] = params.agent_id
        if params.model is not None:
            payload["model"] = params.model
        if params.temperature is not None:
            payload["temperature"] = params.temperature
        if params.max_output_tokens is not None:
            payload["max_output_tokens"] = params.max_output_tokens
        if params.tool_choice is not None:
            payload["tool_choice"] = params.tool_choice
        if params.response_format is not None:
            payload["response_format"] = params.response_format
        if params.user is not None:
            payload["user"] = params.user
        if params.pause_on_tool_calls is not None:
            payload["pause_on_tool_calls"] = params.pause_on_tool_calls
        return payload
