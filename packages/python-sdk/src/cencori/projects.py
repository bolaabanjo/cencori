from typing import TYPE_CHECKING, List

from .types import CreateProjectParams, Project, Stats

if TYPE_CHECKING:
    from .client import Cencori


class ProjectsModule:
    """
    Module for managing Cencori projects.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    def list(self, org_slug: str) -> List[Project]:
        """
        List all projects for an organization.

        Args:
            org_slug: The organization slug identifier

        Returns:
            List of Project objects
        """
        path = f"/api/organizations/{org_slug}/projects"
        data = self._client._request("GET", path)

        return [
            Project(
                id=p["id"],
                name=p["name"],
                slug=p["slug"],
                description=p["description"],
                status=p["status"],
                visibility=p["visibility"],
                created_at=p["created_at"],
                updated_at=p["updated_at"],
            )
            for p in data.get("projects", [])
        ]

    def create(self, org_slug: str, params: CreateProjectParams) -> Project:
        """
        Create a new project.

        Args:
            org_slug: The organization slug
            params: Project creation parameters

        Returns:
            The created Project
        """
        path = f"/api/organizations/{org_slug}/projects"
        payload = {
            "name": params.name,
            "description": params.description,
            "visibility": params.visibility,
        }
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        data = self._client._request("POST", path, json=payload)

        return Project(
            id=data["id"],
            name=data["name"],
            slug=data["slug"],
            description=data["description"],
            status=data["status"],
            visibility=data["visibility"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )

    def get(self, org_slug: str, project_slug: str) -> Project:
        """
        Get a project by slug.

        Args:
            org_slug: The organization slug
            project_slug: The project slug

        Returns:
            Project details including stats
        """
        path = f"/api/organizations/{org_slug}/projects/{project_slug}"
        data = self._client._request("GET", path)

        project = Project(
            id=data["id"],
            name=data["name"],
            slug=data["slug"],
            description=data["description"],
            status=data["status"],
            visibility=data["visibility"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )

        if "stats" in data:
            s = data["stats"]
            project.stats = Stats(
                total_requests=s["total_requests"],
                total_cost_usd=s["total_cost_usd"],
                last_used_at=s.get("last_used_at"),
            )

        return project

    def update(self, org_slug: str, project_slug: str, params: CreateProjectParams) -> None:
        """
        Update a project.

        Args:
            org_slug: The organization slug
            project_slug: The project slug
            params: Parameters to update
        """
        path = f"/api/organizations/{org_slug}/projects/{project_slug}"
        payload = {
            "name": params.name,
            "description": params.description,
            "visibility": params.visibility,
        }
        payload = {k: v for k, v in payload.items() if v is not None}

        self._client._request("PATCH", path, json=payload)

    def delete(self, org_slug: str, project_slug: str) -> None:
        """
        Delete a project.

        Args:
            org_slug: The organization slug
            project_slug: The project slug
        """
        path = f"/api/organizations/{org_slug}/projects/{project_slug}"
        self._client._request("DELETE", path)
