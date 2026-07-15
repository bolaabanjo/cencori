from typing import TYPE_CHECKING, List, NoReturn

from .types import CreateProjectParams, Project

if TYPE_CHECKING:
    from .client import Cencori


_MANAGEMENT_AUTH_ERROR = (
    "Project management is not available with a project API key. "
    "Use the Cencori dashboard until a separately scoped management credential is supported."
)


class ProjectsModule:
    """Project management reserved for a future management-auth API."""

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    @staticmethod
    def _unsupported() -> NoReturn:
        raise NotImplementedError(_MANAGEMENT_AUTH_ERROR)

    def list(self, org_slug: str) -> List[Project]:
        """List projects (not available with project-key authentication)."""
        del org_slug
        self._unsupported()

    def create(self, org_slug: str, params: CreateProjectParams) -> Project:
        """Create a project (not available with project-key authentication)."""
        del org_slug, params
        self._unsupported()

    def get(self, org_slug: str, project_slug: str) -> Project:
        """Get a project (not available with project-key authentication)."""
        del org_slug, project_slug
        self._unsupported()

    def update(self, org_slug: str, project_slug: str, params: CreateProjectParams) -> None:
        """Update a project (not available with project-key authentication)."""
        del org_slug, project_slug, params
        self._unsupported()

    def delete(self, org_slug: str, project_slug: str) -> None:
        """Delete a project (not available with project-key authentication)."""
        del org_slug, project_slug
        self._unsupported()
