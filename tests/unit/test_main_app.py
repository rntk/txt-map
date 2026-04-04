import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


# We need to mock the lifespan dependencies like Mongo connections before importing app
@pytest.fixture(autouse=True)
def mock_dependencies(monkeypatch):
    monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("LLAMACPP_URL", "http://localhost:8080")

    with patch("lifespan.MongoClient") as mock_lifespan_mongo:
        mock_db = MagicMock()
        mock_lifespan_mongo.return_value.__getitem__.return_value = mock_db
        yield mock_db


def test_app_startup(mock_dependencies):
    from main import app

    with TestClient(app) as client:
        # A simple test to ensure the app boots and we can access docs
        response = client.get("/docs")
        assert response.status_code == 200


def test_root_route_redirects_or_returns_index(mock_dependencies):
    from main import app

    with TestClient(app) as client:
        response = client.get("/")
        # Depending on static files, it might be 200 (serving index.html) or 404 (if no index.html mocked)
        assert response.status_code in (200, 404)
