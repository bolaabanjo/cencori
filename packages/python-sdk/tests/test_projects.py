from unittest.mock import MagicMock

import pytest

from cencori.projects import ProjectsModule
from cencori.types import CreateProjectParams


@pytest.fixture
def module():
    return ProjectsModule(MagicMock())


@pytest.mark.parametrize(
    "operation",
    [
        lambda projects: projects.list("org-slug"),
        lambda projects: projects.create("org-slug", CreateProjectParams(name="New")),
        lambda projects: projects.get("org-slug", "project-slug"),
        lambda projects: projects.update(
            "org-slug", "project-slug", CreateProjectParams(name="Updated")
        ),
        lambda projects: projects.delete("org-slug", "project-slug"),
    ],
)
def test_project_management_requires_separate_management_auth(module, operation):
    with pytest.raises(NotImplementedError, match="not available with a project API key"):
        operation(module)
