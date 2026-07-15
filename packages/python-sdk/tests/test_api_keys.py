from unittest.mock import MagicMock

import pytest

from cencori.api_keys import APIKeysModule
from cencori.types import CreateAPIKeyParams


@pytest.fixture
def module():
    return APIKeysModule(MagicMock())


@pytest.mark.parametrize(
    "operation",
    [
        lambda keys: keys.list("project-id", "production"),
        lambda keys: keys.create(
            "project-id", CreateAPIKeyParams(name="New", environment="production")
        ),
        lambda keys: keys.revoke("project-id", "key-id"),
        lambda keys: keys.get_stats("project-id", "key-id"),
    ],
)
def test_api_key_management_requires_separate_management_auth(module, operation):
    with pytest.raises(NotImplementedError, match="not available with a project API key"):
        operation(module)
