"""Agents module for managing AI agents."""

from typing import TYPE_CHECKING, Any, Dict, List, Optional

from .types import (
    Agent,
    AgentConfig,
    AgentKey,
    AgentListItem,
    CreateAgentKeyParams,
    CreateAgentParams,
    UpdateAgentParams,
)

if TYPE_CHECKING:
    from .client import Cencori


class AgentsModule:
    """
    Module for managing AI agents and their API keys.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    def list(self) -> List[AgentListItem]:
        """
        List all agents for the project.

        Returns:
            List of AgentListItem objects
        """
        data = self._client._request("GET", "/v1/agents")
        return [
            AgentListItem(
                id=a["id"],
                name=a["name"],
                description=a.get("description"),
                is_active=a.get("is_active", True),
                shadow_mode=a.get("shadow_mode", False),
                created_at=a.get("created_at", ""),
            )
            for a in data.get("data", [])
        ]

    def create(self, params: CreateAgentParams) -> Agent:
        """
        Create a new AI agent.

        Args:
            params: Agent creation parameters

        Returns:
            The created Agent
        """
        payload: Dict[str, Any] = {"name": params.name}
        if params.description is not None:
            payload["description"] = params.description
        if params.config is not None:
            config = {}
            if params.config.model:
                config["model"] = params.config.model
            if params.config.system_prompt is not None:
                config["system_prompt"] = params.config.system_prompt
            if params.config.tools is not None:
                config["tools"] = params.config.tools
            if params.config.temperature is not None:
                config["temperature"] = params.config.temperature
            payload["config"] = config

        data = self._client._request("POST", "/v1/agents", json=payload)
        return self._parse_agent(data)

    def get(self, agent_id: str) -> Agent:
        """
        Get an agent by ID.

        Args:
            agent_id: The agent ID

        Returns:
            Agent with full details
        """
        data = self._client._request("GET", f"/v1/agents/{agent_id}")
        return self._parse_agent(data)

    def update_config(self, agent_id: str, params: UpdateAgentParams) -> Agent:
        """
        Update an agent's configuration.

        Args:
            agent_id: The agent ID
            params: Parameters to update

        Returns:
            Updated Agent
        """
        payload: Dict[str, Any] = {}
        if params.name is not None:
            payload["name"] = params.name
        if params.description is not None:
            payload["description"] = params.description
        if params.is_active is not None:
            payload["is_active"] = params.is_active
        if params.shadow_mode is not None:
            payload["shadow_mode"] = params.shadow_mode
        if params.config is not None:
            config: Dict[str, Any] = {}
            if params.config.model:
                config["model"] = params.config.model
            if params.config.system_prompt is not None:
                config["system_prompt"] = params.config.system_prompt
            if params.config.tools is not None:
                config["tools"] = params.config.tools
            if params.config.temperature is not None:
                config["temperature"] = params.config.temperature
            payload["config"] = config

        data = self._client._request("PATCH", f"/v1/agents/{agent_id}", json=payload)
        return self._parse_agent(data)

    def delete(self, agent_id: str) -> None:
        """
        Delete an agent by ID.

        Args:
            agent_id: The agent ID
        """
        self._client._request("DELETE", f"/v1/agents/{agent_id}")

    def create_key(self, agent_id: str, params: Optional[CreateAgentKeyParams] = None) -> AgentKey:
        """
        Create an API key for an agent.

        Args:
            agent_id: The agent ID
            params: Key creation parameters

        Returns:
            Created AgentKey
        """
        payload: Dict[str, Any] = {}
        if params is not None:
            if params.name is not None:
                payload["name"] = params.name
            if params.environment is not None:
                payload["environment"] = params.environment
            if params.key_type is not None:
                payload["key_type"] = params.key_type
            if params.allowed_domains is not None:
                payload["allowed_domains"] = params.allowed_domains

        data = self._client._request("POST", f"/v1/agents/{agent_id}/keys", json=payload)
        return AgentKey(
            id=data.get("id", ""),
            name=data.get("name", ""),
            key_prefix=data.get("key_prefix", ""),
            full_key=data.get("full_key"),
            environment=data.get("environment", ""),
            key_type=data.get("key_type", ""),
            agent_id=data.get("agent_id", agent_id),
            created_at=data.get("created_at", ""),
        )

    def _parse_agent(self, data: Dict[str, Any]) -> Agent:
        config = None
        if "config" in data:
            c = data["config"]
            config = AgentConfig(
                model=c.get("model", ""),
                system_prompt=c.get("system_prompt"),
                tools=c.get("tools"),
                temperature=c.get("temperature"),
            )
        return Agent(
            id=data.get("id", ""),
            name=data.get("name", ""),
            description=data.get("description"),
            is_active=data.get("is_active", True),
            shadow_mode=data.get("shadow_mode", False),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at"),
            config=config,
        )
