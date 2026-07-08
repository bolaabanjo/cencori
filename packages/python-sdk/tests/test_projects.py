from unittest.mock import MagicMock

import pytest

from cencori.projects import ProjectsModule
from cencori.types import CreateProjectParams


@pytest.fixture
def mock_client():
    client = MagicMock()
    client._request = MagicMock()
    return client


def test_list_projects(mock_client):
    module = ProjectsModule(mock_client)
    mock_client._request.return_value = {
        "projects": [
            {
                "id": "p1",
                "name": "Project 1",
                "slug": "p1",
                "description": "d1",
                "status": "active",
                "visibility": "private",
                "created_at": "now",
                "updated_at": "now",
            }
        ]
    }

    projects = module.list("org-slug")

    assert len(projects) == 1
    assert projects[0].id == "p1"
    mock_client._request.assert_called_with("GET", "/api/organizations/org-slug/projects")


def test_create_project(mock_client):
    module = ProjectsModule(mock_client)
    mock_client._request.return_value = {
        "id": "p1",
        "name": "New Project",
        "slug": "new-project",
        "description": "Desc",
        "status": "active",
        "visibility": "private",
        "created_at": "now",
        "updated_at": "now",
    }

    params = CreateProjectParams(name="New Project", description="Desc", visibility="private")
    project = module.create("org-slug", params)

    assert project.name == "New Project"
    mock_client._request.assert_called_with(
        "POST",
        "/api/organizations/org-slug/projects",
        json={"name": "New Project", "description": "Desc", "visibility": "private"},
    )


def test_get_project(mock_client):
    module = ProjectsModule(mock_client)
    mock_client._request.return_value = {
        "id": "p1",
        "name": "Project 1",
        "slug": "p1",
        "description": "d1",
        "status": "active",
        "visibility": "private",
        "created_at": "now",
        "updated_at": "now",
        "stats": {"total_requests": 100, "total_cost_usd": 1.50},
    }

    project = module.get("org-slug", "p1")

    assert project.id == "p1"
    assert project.stats is not None
    assert project.stats.total_requests == 100
    mock_client._request.assert_called_with("GET", "/api/organizations/org-slug/projects/p1")


def test_update_project(mock_client):
    module = ProjectsModule(mock_client)

    params = CreateProjectParams(name="Updated", description=None, visibility=None)
    module.update("org-slug", "p1", params)

    mock_client._request.assert_called_with(
        "PATCH", "/api/organizations/org-slug/projects/p1", json={"name": "Updated"}
    )


def test_delete_project(mock_client):
    module = ProjectsModule(mock_client)

    module.delete("org-slug", "p1")

    mock_client._request.assert_called_with("DELETE", "/api/organizations/org-slug/projects/p1")
