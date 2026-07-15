from typing import TYPE_CHECKING, List, NoReturn

from .types import APIKey, CreateAPIKeyParams, KeyUsageStats

if TYPE_CHECKING:
    from .client import Cencori


_MANAGEMENT_AUTH_ERROR = (
    "API-key management is not available with a project API key. "
    "Use the Cencori dashboard until a separately scoped management credential is supported."
)


class APIKeysModule:
    """API-key management reserved for a future management-auth API."""

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    @staticmethod
    def _unsupported() -> NoReturn:
        raise NotImplementedError(_MANAGEMENT_AUTH_ERROR)

    def list(self, project_id: str, environment: str) -> List[APIKey]:
        """List API keys (not available with project-key authentication)."""
        del project_id, environment
        self._unsupported()

    def create(self, project_id: str, params: CreateAPIKeyParams) -> APIKey:
        """Create an API key (not available with project-key authentication)."""
        del project_id, params
        self._unsupported()

    def revoke(self, project_id: str, key_id: str) -> None:
        """Revoke an API key (not available with project-key authentication)."""
        del project_id, key_id
        self._unsupported()

    def get_stats(self, project_id: str, key_id: str) -> KeyUsageStats:
        """Read key stats (not available with project-key authentication)."""
        del project_id, key_id
        self._unsupported()
