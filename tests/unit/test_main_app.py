import pytest
from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.testclient import TestClient
from pathlib import Path
from unittest.mock import patch, MagicMock


# We need to mock the lifespan dependencies like Mongo connections before importing app
@pytest.fixture(autouse=True)
def mock_dependencies(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("LLAMACPP_URL", "http://localhost:8080")

    with patch("lifespan.MongoClient") as mock_lifespan_mongo:
        mock_db = MagicMock()
        mock_lifespan_mongo.return_value.__getitem__.return_value = mock_db
        yield mock_db


def test_app_startup(mock_dependencies: MagicMock) -> None:
    from main import app

    with TestClient(app) as client:
        # A simple test to ensure the app boots and we can access docs
        response = client.get("/docs")
        assert response.status_code == 200


def test_root_route_redirects_or_returns_index(mock_dependencies: MagicMock) -> None:
    from main import app

    with TestClient(app) as client:
        response = client.get("/")
        # Depending on static files, it might be 200 (serving index.html) or 404 (if no index.html mocked)
        assert response.status_code in (200, 404)


def test_serve_frontend_page_returns_index(
    mock_dependencies: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    import main

    index_file = tmp_path / "index.html"
    index_file.write_text("<div>app</div>", encoding="utf-8")
    monkeypatch.setattr(main, "FRONTEND_INDEX", str(index_file))

    response = main.get_frontend_index_response()

    assert isinstance(response, FileResponse)
    assert response.path == str(index_file)


def test_serve_frontend_page_raises_404_when_index_is_missing(
    mock_dependencies: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    import main

    missing_index = tmp_path / "missing.html"
    monkeypatch.setattr(main, "FRONTEND_INDEX", str(missing_index))

    with pytest.raises(HTTPException) as exc_info:
        main.get_frontend_index_response()

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Frontend build not found"
