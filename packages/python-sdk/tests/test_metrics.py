
import pytest
from unittest.mock import MagicMock
from cencori.metrics import MetricsModule

@pytest.fixture
def mock_client():
    client = MagicMock()
    client._request = MagicMock()
    return client

def test_get_metrics(mock_client):
    module = MetricsModule(mock_client)
    mock_client._request.return_value = {
        "period": "24h",
        "start_date": "yesterday",
        "end_date": "today",
        "requests": {
            "total": 100, "success": 95, "error": 5, 
            "filtered": 0, "success_rate": 0.95
        },
        "cost": {"total_usd": 1.0, "average_per_request_usd": 0.01},
        "tokens": {"prompt": 1000, "completion": 500, "total": 1500},
        "latency": {"avg_ms": 100, "p50_ms": 90, "p90_ms": 150, "p99_ms": 300},
        "providers": {
            "openai": {"requests": 80, "cost_usd": 0.8}
        },
        "models": {
            "gpt-4o": {"requests": 80, "cost_usd": 0.8}
        }
    }
    
    metrics = module.get("24h")
    
    assert metrics.period == "24h"
    assert metrics.requests.total == 100
    assert metrics.cost.total_usd == 1.0
    assert metrics.providers["openai"].requests == 80
    mock_client._request.assert_called_with("GET", "/v1/metrics?period=24h")
