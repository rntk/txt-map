"""Tests for the authentication handler."""

import hashlib
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from handlers.auth_handler import (
    SESSION_COOKIE_NAME,
    _create_session_token,
    get_current_session,
    require_auth,
    require_superuser,
)


# We need to mock the lifespan dependencies like Mongo connections before importing app
@pytest.fixture(autouse=True)
def mock_dependencies(monkeypatch):
    monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("LLAMACPP_URL", "http://localhost:8080")
    with patch("lifespan.MongoClient") as mock_lifespan_mongo:
        mock_db = MagicMock()
        mock_lifespan_mongo.return_value.__getitem__.return_value = mock_db
        yield mock_db


@pytest.fixture
def app(mock_dependencies):
    from main import app

    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def mock_token_storage():
    """Create a mock TokenStorage."""
    storage = MagicMock()
    return storage


@pytest.fixture(autouse=True)
def setup_token_storage_override(app, mock_token_storage):
    from handlers.dependencies import get_token_storage

    app.dependency_overrides[get_token_storage] = lambda: mock_token_storage
    yield
    app.dependency_overrides = {}


class TestGetCurrentSession:
    """Tests for the get_current_session function."""

    def test_user_token_authentication_via_bearer_header(
        self, mock_token_storage, mock_dependencies
    ):
        """Test authenticating with a valid user token via Bearer header."""
        from handlers import auth_handler

        # Skip if no SUPER_TOKEN is configured (auth disabled)
        if not auth_handler.SUPER_TOKEN:
            pytest.skip("SUPER_TOKEN not configured")

        user_token = "test-user-token-123"
        token_hash = hashlib.sha256(user_token.encode()).hexdigest()

        mock_token_storage.find_by_hash.return_value = {
            "_id": "token123",
            "token_hash": token_hash,
            "alias": "Test User",
            "notes": "",
            "created_at": datetime.now(UTC),
            "created_by": "superuser",
        }

        request = MagicMock()
        request.cookies = {}
        request.headers = {"Authorization": f"Bearer {user_token}"}

        session = get_current_session(request, mock_token_storage)

        assert session is not None
        assert session["type"] == "user"
        assert session["alias"] == "Test User"
        mock_token_storage.find_by_hash.assert_called_once_with(token_hash)

    def test_session_token_authentication(self, mock_token_storage):
        """Test authenticating with a valid session token."""
        from handlers import auth_handler

        if not auth_handler.SUPER_TOKEN:
            pytest.skip("SUPER_TOKEN not configured")

        session_token = _create_session_token(is_superuser=True)

        request = MagicMock()
        request.cookies = {}
        request.headers = {"Authorization": f"Bearer {session_token}"}

        session = get_current_session(request, mock_token_storage)

        assert session is not None
        assert session["type"] == "superuser"
        mock_token_storage.find_by_hash.assert_not_called()

    def test_cookie_authentication(self, mock_token_storage):
        """Test authenticating with a session cookie."""
        from handlers import auth_handler

        if not auth_handler.SUPER_TOKEN:
            pytest.skip("SUPER_TOKEN not configured")

        session_token = _create_session_token(is_superuser=True)

        request = MagicMock()
        request.cookies = {SESSION_COOKIE_NAME: session_token}
        request.headers = {}

        session = get_current_session(request, mock_token_storage)

        assert session is not None
        assert session["type"] == "superuser"

    def test_invalid_user_token(self, mock_token_storage):
        """Test that invalid user token returns None."""
        from handlers import auth_handler

        if not auth_handler.SUPER_TOKEN:
            pytest.skip("SUPER_TOKEN not configured")

        user_token = "invalid-token"
        token_hash = hashlib.sha256(user_token.encode()).hexdigest()

        mock_token_storage.find_by_hash.return_value = None

        request = MagicMock()
        request.cookies = {}
        request.headers = {"Authorization": f"Bearer {user_token}"}

        session = get_current_session(request, mock_token_storage)

        assert session is None
        mock_token_storage.find_by_hash.assert_called_once_with(token_hash)

    def test_no_auth_header(self, mock_token_storage):
        """Test that request without auth returns None."""
        request = MagicMock()
        request.cookies = {}
        request.headers = {}

        session = get_current_session(request, mock_token_storage)

        assert session is None

    def test_malformed_auth_header(self, mock_token_storage):
        """Test that malformed auth header returns None."""
        request = MagicMock()
        request.cookies = {}
        request.headers = {"Authorization": "Basic invalid"}

        session = get_current_session(request, mock_token_storage)

        assert session is None


class TestRequireAuth:
    """Tests for the require_auth dependency."""

    def test_require_auth_with_user_token(self, mock_token_storage):
        """Test require_auth with valid user token."""
        from handlers import auth_handler

        if not auth_handler.SUPER_TOKEN:
            pytest.skip("SUPER_TOKEN not configured")

        user_token = "test-user-token-123"
        token_hash = hashlib.sha256(user_token.encode()).hexdigest()

        mock_token_storage.find_by_hash.return_value = {
            "_id": "token123",
            "token_hash": token_hash,
            "alias": "Test User",
            "notes": "",
            "created_at": datetime.now(UTC),
            "created_by": "superuser",
        }

        request = MagicMock()
        request.cookies = {}
        request.headers = {"Authorization": f"Bearer {user_token}"}

        session = require_auth(request, mock_token_storage)

        assert session["type"] == "user"
        assert session["alias"] == "Test User"

    def test_require_auth_unauthorized(self, mock_token_storage):
        """Test require_auth raises 401 when not authenticated."""
        from handlers import auth_handler

        if not auth_handler.SUPER_TOKEN:
            pytest.skip("SUPER_TOKEN not configured")

        request = MagicMock()
        request.cookies = {}
        request.headers = {}

        with pytest.raises(HTTPException) as exc_info:
            require_auth(request, mock_token_storage)

        assert exc_info.value.status_code == 401
        assert "Authentication required" in str(exc_info.value.detail)

    def test_require_auth_anonymous_when_no_super_token(
        self, mock_token_storage, monkeypatch
    ):
        """Test require_auth allows anonymous access when SUPER_TOKEN not set."""
        from handlers import auth_handler

        monkeypatch.setattr(auth_handler, "SUPER_TOKEN", "")

        request = MagicMock()
        request.cookies = {}
        request.headers = {}

        session = require_auth(request, mock_token_storage)

        assert session["type"] == "anonymous"
        assert session["alias"] is None


class TestRequireSuperuser:
    """Tests for the require_superuser dependency."""

    def test_require_superuser_rejects_user_token(
        self, mock_token_storage: MagicMock, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Test require_superuser raises 403 for valid non-superuser token."""
        from handlers import auth_handler

        test_super_token: str = "test-super-token-secret"
        monkeypatch.setattr(auth_handler, "SUPER_TOKEN", test_super_token)

        user_token: str = "test-user-token-123"
        token_hash: str = hashlib.sha256(user_token.encode()).hexdigest()

        mock_token_storage.find_by_hash.return_value = {
            "_id": "token123",
            "token_hash": token_hash,
            "alias": "Test User",
            "notes": "",
            "created_at": datetime.now(UTC),
            "created_by": "superuser",
        }

        request: MagicMock = MagicMock()
        request.cookies = {}
        request.headers = {"Authorization": f"Bearer {user_token}"}

        with pytest.raises(HTTPException) as exc_info:
            require_superuser(request, mock_token_storage)

        assert exc_info.value.status_code == 403
        assert "Superuser access required" in str(exc_info.value.detail)
        mock_token_storage.find_by_hash.assert_called_once_with(token_hash)

    def test_superuser_route_rejects_user_bearer_token(
        self,
        client: TestClient,
        mock_token_storage: MagicMock,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test superuser-only routes check Bearer user tokens via DI storage."""
        from handlers import auth_handler

        test_super_token: str = "test-super-token-secret"
        monkeypatch.setattr(auth_handler, "SUPER_TOKEN", test_super_token)

        user_token: str = "test-user-token-456"
        token_hash: str = hashlib.sha256(user_token.encode()).hexdigest()

        mock_token_storage.find_by_hash.return_value = {
            "_id": "token456",
            "token_hash": token_hash,
            "alias": "API User",
            "notes": "",
            "created_at": datetime.now(UTC),
            "created_by": "superuser",
        }

        response = client.get(
            "/api/tokens",
            headers={"Authorization": f"Bearer {user_token}"},
        )

        assert response.status_code == 403
        assert "Superuser access required" in response.json()["detail"]
        mock_token_storage.find_by_hash.assert_any_call(token_hash)


class TestLoginEndpoint:
    """Tests for the /auth/login endpoint."""

    def test_login_returns_session_token_for_superuser(
        self, client, mock_token_storage, monkeypatch
    ):
        """Test that login returns session_token for superuser."""
        from handlers import auth_handler

        test_super_token = "test-super-token-secret"
        monkeypatch.setattr(auth_handler, "SUPER_TOKEN", test_super_token)

        response = client.post(
            "/api/auth/login",
            json={"token": test_super_token},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["is_superuser"] is True
        assert "session_token" in data
        assert len(data["session_token"]) > 0

    def test_login_returns_session_token_for_user_token(
        self, client, mock_token_storage, monkeypatch
    ):
        """Test that login returns session_token for valid user token."""
        from handlers import auth_handler

        test_super_token = "test-super-token-secret"
        monkeypatch.setattr(auth_handler, "SUPER_TOKEN", test_super_token)

        user_token = "test-user-token-456"
        token_hash = hashlib.sha256(user_token.encode()).hexdigest()

        mock_token_storage.find_by_hash.return_value = {
            "_id": "token456",
            "token_hash": token_hash,
            "alias": "API User",
            "notes": "Test notes",
            "created_at": datetime.now(UTC),
            "created_by": "superuser",
        }

        response = client.post(
            "/api/auth/login",
            json={"token": user_token},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["is_superuser"] is False
        assert data["alias"] == "API User"
        assert "session_token" in data
        assert len(data["session_token"]) > 0

    def test_login_rejects_invalid_token(self, client, mock_token_storage, monkeypatch):
        """Test that login rejects invalid tokens."""
        from handlers import auth_handler

        test_super_token = "test-super-token-secret"
        monkeypatch.setattr(auth_handler, "SUPER_TOKEN", test_super_token)

        mock_token_storage.find_by_hash.return_value = None

        response = client.post(
            "/api/auth/login",
            json={"token": "invalid-token"},
        )

        assert response.status_code == 401
        assert "Invalid token" in response.json()["detail"]

    def test_login_sets_cookie(self, client, mock_token_storage, monkeypatch):
        """Test that login sets session cookie."""
        from handlers import auth_handler

        test_super_token = "test-super-token-secret"
        monkeypatch.setattr(auth_handler, "SUPER_TOKEN", test_super_token)

        response = client.post(
            "/api/auth/login",
            json={"token": test_super_token},
        )

        assert response.status_code == 200
        assert "session_token" in response.cookies


class TestVerifyEndpoint:
    """Tests for the /auth/verify endpoint."""

    def test_verify_with_user_token_bearer(
        self, client, mock_token_storage, monkeypatch
    ):
        """Test verify endpoint with user token in Bearer header."""
        from handlers import auth_handler

        test_super_token = "test-super-token-secret"
        monkeypatch.setattr(auth_handler, "SUPER_TOKEN", test_super_token)

        user_token = "test-user-token-789"
        token_hash = hashlib.sha256(user_token.encode()).hexdigest()

        mock_token_storage.find_by_hash.return_value = {
            "_id": "token789",
            "token_hash": token_hash,
            "alias": "Verified User",
            "notes": "",
            "created_at": datetime.now(UTC),
            "created_by": "superuser",
        }

        response = client.get(
            "/api/auth/verify",
            headers={"Authorization": f"Bearer {user_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is True
        assert data["is_superuser"] is False
        assert data["alias"] == "Verified User"


class TestProtectedRoutes:
    """Tests for protected API routes with token authentication."""

    def test_protected_route_without_auth(self, client, monkeypatch):
        """Test that protected route rejects unauthenticated requests."""
        test_super_token = "test-super-token-secret"
        monkeypatch.setattr("handlers.auth_handler.SUPER_TOKEN", test_super_token)

        response = client.get("/api/submissions")

        assert response.status_code == 401
        assert "Authentication required" in response.json()["detail"]
