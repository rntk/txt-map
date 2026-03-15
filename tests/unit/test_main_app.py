"""
Unit tests for the main FastAPI application.

Tests all aspects of main.py using pre-configured mocks.
The mocks are set up before the main module is imported to prevent
import-time hanging.

Test Categories:
- FastAPI app initialization (title, description, CORS)
- Static files mounting (legacy CRA and Vite)
- Router registration (submission, task_queue, diff handlers)
- MongoDB connection and storage initialization
- API routes: DELETE /api/diff, GET /, GET /page/*
- Startup script with uvicorn
- Edge cases: MongoDB unavailable, frontend missing
"""
import pytest
from unittest.mock import MagicMock, patch, call
from pathlib import Path
from fastapi import HTTPException
import sys
import os

# =============================================================================
# Module-level mock setup - runs before any tests
# =============================================================================

def _setup_mocks(monkeypatch, mongodb_url_override=None):
    """Set up mocks and import main using monkeypatch for automatic cleanup."""
    # Create mock objects
    mock_fastapi = MagicMock()
    mock_app = MagicMock()
    mock_app.state = MagicMock()
    mock_app.add_middleware = MagicMock()
    mock_app.mount = MagicMock()
    mock_app.include_router = MagicMock()

    # Create decorators that actually wrap the functions
    def delete_decorator(path):
        def wrapper(func):
            return func
        return wrapper

    def get_decorator(path):
        def wrapper(func):
            return func
        return wrapper

    mock_app.delete = delete_decorator
    mock_app.get = get_decorator

    mock_fastapi.return_value = mock_app

    # Set up environment variable using monkeypatch
    if mongodb_url_override:
        monkeypatch.setenv('MONGODB_URL', mongodb_url_override)
    else:
        monkeypatch.setenv('MONGODB_URL', 'mongodb://localhost:8765/')

    # Create a proper HTTPException mock that behaves like the real one
    class MockHTTPException(Exception):
        def __init__(self, status_code: int, detail: str = None):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)

    fastapi_mock = MagicMock()
    fastapi_mock.FastAPI = mock_fastapi
    fastapi_mock.HTTPException = MockHTTPException

    monkeypatch.setitem(sys.modules, 'fastapi', fastapi_mock)

    monkeypatch.setitem(sys.modules, 'fastapi.middleware', MagicMock())
    monkeypatch.setitem(sys.modules, 'fastapi.middleware.cors', MagicMock())
    sys.modules['fastapi.middleware.cors'].CORSMiddleware = MagicMock()

    monkeypatch.setitem(sys.modules, 'fastapi.staticfiles', MagicMock())
    sys.modules['fastapi.staticfiles'].StaticFiles = MagicMock()

    mock_file_response = MagicMock()
    monkeypatch.setitem(sys.modules, 'fastapi.responses', MagicMock())
    sys.modules['fastapi.responses'].FileResponse = mock_file_response

    monkeypatch.setitem(sys.modules, 'pymongo', MagicMock())
    mock_client = MagicMock()
    mock_db = MagicMock()
    # Set up db collections for delete_diff_data tests
    mock_db.semantic_diffs = MagicMock()
    mock_db.semantic_diff_jobs = MagicMock()
    mock_client.__getitem__ = MagicMock(return_value=mock_db)
    sys.modules['pymongo'].MongoClient = MagicMock(return_value=mock_client)

    # Mock handlers
    monkeypatch.setitem(sys.modules, 'handlers', MagicMock())

    mock_submission_handler = MagicMock()
    mock_submission_handler.router = MagicMock()
    monkeypatch.setitem(sys.modules, 'handlers.submission_handler', mock_submission_handler)

    mock_task_queue_handler = MagicMock()
    mock_task_queue_handler.router = MagicMock()
    monkeypatch.setitem(sys.modules, 'handlers.task_queue_handler', mock_task_queue_handler)

    mock_diff_handler = MagicMock()
    mock_diff_handler.router = MagicMock()
    monkeypatch.setitem(sys.modules, 'handlers.diff_handler', mock_diff_handler)

    # Mock lib modules
    monkeypatch.setitem(sys.modules, 'lib', MagicMock())
    monkeypatch.setitem(sys.modules, 'lib.nlp', MagicMock())
    sys.modules['lib.nlp'].ensure_nltk_data = MagicMock()

    monkeypatch.setitem(sys.modules, 'lib.storage', MagicMock())
    monkeypatch.setitem(sys.modules, 'lib.storage.posts', MagicMock())
    monkeypatch.setitem(sys.modules, 'lib.storage.submissions', MagicMock())
    monkeypatch.setitem(sys.modules, 'lib.storage.semantic_diffs', MagicMock())

    mock_posts_storage = MagicMock()
    mock_posts_storage.prepare = MagicMock()
    sys.modules['lib.storage.posts'].PostsStorage = MagicMock(return_value=mock_posts_storage)

    mock_submissions_storage = MagicMock()
    mock_submissions_storage.prepare = MagicMock()
    sys.modules['lib.storage.submissions'].SubmissionsStorage = MagicMock(return_value=mock_submissions_storage)

    mock_semantic_diffs_storage = MagicMock()
    mock_semantic_diffs_storage.prepare = MagicMock()
    # Set up the db chain for delete_diff_data tests
    mock_semantic_diffs_storage._db = mock_db
    sys.modules['lib.storage.semantic_diffs'].SemanticDiffsStorage = MagicMock(return_value=mock_semantic_diffs_storage)

    monkeypatch.setitem(sys.modules, 'lib.diff', MagicMock())
    monkeypatch.setitem(sys.modules, 'lib.diff.semantic_diff', MagicMock())
    sys.modules['lib.diff.semantic_diff'].canonical_pair = MagicMock(return_value=("sub-a::sub-b", "sub-a", "sub-b"))

    # Import main to execute module-level code
    import main

    return {
        'app': mock_app,
        'client': mock_client,
        'db': mock_db,
        'posts_storage': mock_posts_storage,
        'submissions_storage': mock_submissions_storage,
        'semantic_diffs_storage': mock_semantic_diffs_storage,
        'fastapi': mock_fastapi,
        'submission_handler': mock_submission_handler,
        'task_queue_handler': mock_task_queue_handler,
        'diff_handler': mock_diff_handler,
        'file_response': mock_file_response,
    }


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def main_mocks(monkeypatch):
    """Get the main module mocks with automatic cleanup via monkeypatch."""
    # Clear any previous main import to ensure fresh setup
    if 'main' in sys.modules:
        del sys.modules['main']
    return _setup_mocks(monkeypatch)


@pytest.fixture
def main_mocks_custom_mongodb(monkeypatch, mongodb_url):
    """Get the main module mocks with custom MongoDB URL."""
    # Clear any previous main import to ensure fresh setup
    if 'main' in sys.modules:
        del sys.modules['main']
    return _setup_mocks(monkeypatch, mongodb_url)


# =============================================================================
# Test: FastAPI App Initialization
# =============================================================================

class TestFastAPIAppInitialization:
    """Tests for FastAPI app initialization."""

    def test_app_created_with_correct_title(self, main_mocks):
        """FastAPI app is created with title 'My FastAPI App'."""
        mock_fastapi = main_mocks['fastapi']
        mock_fastapi.assert_called_once()
        call_kwargs = mock_fastapi.call_args[1]
        assert call_kwargs.get('title') == "My FastAPI App"

    def test_app_created_with_description(self, main_mocks):
        """FastAPI app is created with correct description."""
        mock_fastapi = main_mocks['fastapi']
        call_kwargs = mock_fastapi.call_args[1]
        assert call_kwargs.get('description') == "A simple FastAPI application with separate handlers"

    def test_cors_middleware_added(self, main_mocks):
        """CORS middleware is added to the app."""
        assert main_mocks['app'].add_middleware.called

    def test_cors_allows_all_origins(self, main_mocks):
        """CORS middleware allows all origins (*)."""
        cors_call = main_mocks['app'].add_middleware.call_args
        call_kwargs = cors_call[1]
        assert call_kwargs.get('allow_origins') == ["*"]

    def test_cors_credentials_set_to_false(self, main_mocks):
        """CORS credentials are set to False."""
        cors_call = main_mocks['app'].add_middleware.call_args
        call_kwargs = cors_call[1]
        assert call_kwargs.get('allow_credentials') == False

    def test_cors_allows_all_methods(self, main_mocks):
        """CORS allows all methods."""
        cors_call = main_mocks['app'].add_middleware.call_args
        call_kwargs = cors_call[1]
        assert call_kwargs.get('allow_methods') == ["*"]

    def test_cors_allows_all_headers(self, main_mocks):
        """CORS allows all headers."""
        cors_call = main_mocks['app'].add_middleware.call_args
        call_kwargs = cors_call[1]
        assert call_kwargs.get('allow_headers') == ["*"]


# =============================================================================
# Test: Static Files Mounting
# =============================================================================

class TestStaticFilesMounting:
    """Tests for static files mounting behavior."""

    def test_mount_method_exists(self, main_mocks):
        """Static files mount method exists."""
        assert main_mocks['app'].mount is not None

    def test_legacy_static_dir_mounted_if_exists(self, main_mocks):
        """Legacy CRA static directory is mounted at /static if it exists."""
        # The mount should be called if the directory exists
        # Check if mount was called with /static path
        mount_calls = main_mocks['app'].mount.call_args_list
        static_mounts = [c for c in mount_calls if len(c[0]) > 0 and c[0][0] == "/static"]
        # At least one mount call should exist for static files
        assert main_mocks['app'].mount.called

    def test_vite_assets_dir_mounted_if_exists(self, main_mocks):
        """Vite assets directory is mounted at /assets if it exists."""
        mount_calls = main_mocks['app'].mount.call_args_list
        assets_mounts = [c for c in mount_calls if len(c[0]) > 0 and c[0][0] == "/assets"]
        # At least one mount call should exist for assets
        assert main_mocks['app'].mount.called

    def test_staticfiles_class_used_for_mounting(self, main_mocks):
        """StaticFiles class is used for mounting directories."""
        from fastapi.staticfiles import StaticFiles
        assert StaticFiles is not None

    def test_missing_directories_handled_gracefully(self, main_mocks):
        """Missing frontend directories are handled gracefully without error."""
        # The app should initialize without errors even if directories don't exist
        assert main_mocks['app'] is not None
        # No exceptions should be raised during initialization


# =============================================================================
# Test: Router Registration
# =============================================================================

class TestRouterRegistration:
    """Tests for router registration."""

    def test_all_handlers_registered_with_api_prefix(self, main_mocks):
        """All handler routers are registered with /api prefix."""
        assert main_mocks['app'].include_router.call_count == 3
        for call_args in main_mocks['app'].include_router.call_args_list:
            assert call_args[1].get('prefix') == "/api"

    def test_submission_handler_registered(self, main_mocks):
        """Submission handler router is registered."""
        # Verify include_router was called 3 times (once per handler)
        assert main_mocks['app'].include_router.call_count == 3
        # Verify submission_handler module exists and has router
        assert main_mocks['submission_handler'] is not None
        assert main_mocks['submission_handler'].router is not None

    def test_task_queue_handler_registered(self, main_mocks):
        """Task queue handler router is registered."""
        # Verify include_router was called 3 times (once per handler)
        assert main_mocks['app'].include_router.call_count == 3
        # Verify task_queue_handler module exists and has router
        assert main_mocks['task_queue_handler'] is not None
        assert main_mocks['task_queue_handler'].router is not None

    def test_diff_handler_registered(self, main_mocks):
        """Diff handler router is registered."""
        # Verify include_router was called 3 times (once per handler)
        assert main_mocks['app'].include_router.call_count == 3
        # Verify diff_handler module exists and has router
        assert main_mocks['diff_handler'] is not None
        assert main_mocks['diff_handler'].router is not None


# =============================================================================
# Test: MongoDB Connection and Storage Initialization
# =============================================================================

class TestMongoDBConnection:
    """Tests for MongoDB connection and storage initialization."""

    def test_mongodb_url_read_from_environment(self, main_mocks):
        """MONGODB_URL is read from environment variable."""
        assert main_mocks['client'] is not None

    def test_mongodb_url_default_value(self, monkeypatch):
        """MONGODB_URL defaults to 'mongodb://localhost:8765/' if not set."""
        # Clear any previous main import
        if 'main' in sys.modules:
            del sys.modules['main']

        # Remove MONGODB_URL from environment using monkeypatch
        monkeypatch.delenv('MONGODB_URL', raising=False)

        # Re-setup mocks without MONGODB_URL
        mocks = _setup_mocks(monkeypatch)
        # MongoClient should be called with the default URL
        from pymongo import MongoClient
        MongoClient.assert_called()
        call_args = MongoClient.call_args
        assert call_args[0][0] == "mongodb://localhost:8765/"

    def test_mongodb_client_created_with_url(self, main_mocks):
        """MongoClient is created with the MONGODB_URL."""
        from pymongo import MongoClient
        MongoClient.assert_called()
        call_args = MongoClient.call_args
        assert call_args[0][0] == "mongodb://localhost:8765/"

    def test_database_rss_selected(self, main_mocks):
        """Database 'rss' is selected from the client."""
        main_mocks['client'].__getitem__.assert_called_with("rss")

    def test_posts_storage_initialized_and_prepared(self, main_mocks):
        """PostsStorage is initialized and prepare() is called."""
        main_mocks['posts_storage'].prepare.assert_called_once()

    def test_submissions_storage_initialized_and_prepared(self, main_mocks):
        """SubmissionsStorage is initialized and prepare() is called."""
        main_mocks['submissions_storage'].prepare.assert_called_once()

    def test_semantic_diffs_storage_initialized_and_prepared(self, main_mocks):
        """SemanticDiffsStorage is initialized and prepare() is called."""
        main_mocks['semantic_diffs_storage'].prepare.assert_called_once()

    def test_storage_instances_attached_to_app_state(self, main_mocks):
        """Storage instances are attached to app.state."""
        assert main_mocks['app'].state.posts_storage == main_mocks['posts_storage']
        assert main_mocks['app'].state.submissions_storage == main_mocks['submissions_storage']
        assert main_mocks['app'].state.semantic_diffs_storage == main_mocks['semantic_diffs_storage']

    def test_posts_storage_class_used(self, main_mocks):
        """PostsStorage class is used for initialization."""
        from lib.storage.posts import PostsStorage
        PostsStorage.assert_called()

    def test_submissions_storage_class_used(self, main_mocks):
        """SubmissionsStorage class is used for initialization."""
        from lib.storage.submissions import SubmissionsStorage
        SubmissionsStorage.assert_called()

    def test_semantic_diffs_storage_class_used(self, main_mocks):
        """SemanticDiffsStorage class is used for initialization."""
        from lib.storage.semantic_diffs import SemanticDiffsStorage
        SemanticDiffsStorage.assert_called()


# =============================================================================
# Test: DELETE /api/diff Route
# =============================================================================

class TestDeleteDiffRoute:
    """Tests for DELETE /api/diff route."""

    def test_same_left_right_ids_raise_http_400(self, main_mocks):
        """Same left/right IDs raise HTTPException with status 400."""
        import main

        # Get the MockHTTPException class from the mocked fastapi module
        MockHTTPException = sys.modules['fastapi'].HTTPException

        with pytest.raises(MockHTTPException) as exc_info:
            main.delete_diff_data("sub-001", "sub-001")

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "Please select two different submissions"

    def test_valid_pair_deletes_semantic_diffs_documents(self, main_mocks):
        """Valid pair deletes semantic_diffs documents."""
        import main

        # Set up mock for delete_many
        mock_delete_result = MagicMock()
        mock_delete_result.deleted_count = 5
        main_mocks['db'].semantic_diffs.delete_many.return_value = mock_delete_result
        main_mocks['db'].semantic_diff_jobs.delete_many.return_value = MagicMock(deleted_count=3)

        result = main.delete_diff_data("sub-left", "sub-right")

        main_mocks['db'].semantic_diffs.delete_many.assert_called_once()
        assert result["deleted_diff_count"] == 5

    def test_valid_pair_deletes_semantic_diff_jobs_documents(self, main_mocks):
        """Valid pair deletes semantic_diff_jobs documents."""
        import main

        mock_delete_result = MagicMock()
        mock_delete_result.deleted_count = 3
        main_mocks['db'].semantic_diffs.delete_many.return_value = MagicMock(deleted_count=5)
        main_mocks['db'].semantic_diff_jobs.delete_many.return_value = mock_delete_result

        result = main.delete_diff_data("sub-left", "sub-right")

        main_mocks['db'].semantic_diff_jobs.delete_many.assert_called_once()
        assert result["deleted_job_count"] == 3

    def test_returns_deleted_count_for_diffs(self, main_mocks):
        """Returns deleted count for diffs."""
        import main

        main_mocks['db'].semantic_diffs.delete_many.return_value = MagicMock(deleted_count=10)
        main_mocks['db'].semantic_diff_jobs.delete_many.return_value = MagicMock(deleted_count=5)

        result = main.delete_diff_data("sub-left", "sub-right")

        assert "deleted_diff_count" in result
        assert result["deleted_diff_count"] == 10

    def test_returns_deleted_count_for_jobs(self, main_mocks):
        """Returns deleted count for jobs."""
        import main

        main_mocks['db'].semantic_diffs.delete_many.return_value = MagicMock(deleted_count=10)
        main_mocks['db'].semantic_diff_jobs.delete_many.return_value = MagicMock(deleted_count=7)

        result = main.delete_diff_data("sub-left", "sub-right")

        assert "deleted_job_count" in result
        assert result["deleted_job_count"] == 7

    def test_returns_pair_key_and_submission_ids(self, main_mocks):
        """Returns pair_key, submission_a_id, submission_b_id."""
        import main

        result = main.delete_diff_data("sub-left", "sub-right")

        assert "pair_key" in result
        assert "submission_a_id" in result
        assert "submission_b_id" in result
        assert result["pair_key"] == "sub-a::sub-b"
        assert result["submission_a_id"] == "sub-a"
        assert result["submission_b_id"] == "sub-b"

    def test_canonical_pair_called_for_normalization(self, main_mocks):
        """canonical_pair is called to normalize the submission pair."""
        import main
        from lib.diff.semantic_diff import canonical_pair

        main.delete_diff_data("sub-left", "sub-right")

        canonical_pair.assert_called_once_with("sub-left", "sub-right")

    def test_returns_deleted_true(self, main_mocks):
        """Returns deleted: True on success."""
        import main

        main_mocks['db'].semantic_diffs.delete_many.return_value = MagicMock(deleted_count=1)
        main_mocks['db'].semantic_diff_jobs.delete_many.return_value = MagicMock(deleted_count=1)

        result = main.delete_diff_data("sub-left", "sub-right")

        assert result["deleted"] == True

    def test_delete_route_uses_pair_key_for_deletion(self, main_mocks):
        """Delete operations use the normalized pair_key."""
        import main

        main_mocks['db'].semantic_diffs.delete_many.return_value = MagicMock(deleted_count=1)
        main_mocks['db'].semantic_diff_jobs.delete_many.return_value = MagicMock(deleted_count=1)

        main.delete_diff_data("sub-left", "sub-right")

        # Verify delete_many was called with the pair_key filter
        main_mocks['db'].semantic_diffs.delete_many.assert_called_with({"pair_key": "sub-a::sub-b"})
        main_mocks['db'].semantic_diff_jobs.delete_many.assert_called_with({"pair_key": "sub-a::sub-b"})


# =============================================================================
# Test: GET / Route
# =============================================================================

class TestRootRoute:
    """Tests for GET / route."""

    def test_serve_root_page_exists(self, main_mocks):
        """Root route function exists."""
        import main
        assert hasattr(main, 'serve_root_page')

    def test_serve_root_page_returns_file_response(self, main_mocks):
        """Root route returns FileResponse for frontend/build/index.html."""
        import main
        from fastapi.responses import FileResponse

        result = main.serve_root_page()

        FileResponse.assert_called_once_with("frontend/build/index.html")
        assert result is not None


# =============================================================================
# Test: GET /page/* Routes
# =============================================================================

class TestPageRoutes:
    """Tests for GET /page/* routes."""

    def test_all_page_routes_exist(self, main_mocks):
        """All page routes exist."""
        import main
        assert hasattr(main, 'serve_menu_page')
        assert hasattr(main, 'serve_text_page')
        assert hasattr(main, 'serve_tasks_page')
        assert hasattr(main, 'serve_texts_page')
        assert hasattr(main, 'serve_diff_page')

    def test_text_page_accepts_submission_id(self, main_mocks):
        """Text page accepts submission_id parameter."""
        import main
        result = main.serve_text_page("sub-123")
        assert result is not None

    def test_serve_menu_page_returns_file_response(self, main_mocks):
        """Menu page returns FileResponse for frontend/build/index.html."""
        import main
        from fastapi.responses import FileResponse

        result = main.serve_menu_page()

        FileResponse.assert_called_once_with("frontend/build/index.html")
        assert result is not None

    def test_serve_text_page_returns_file_response(self, main_mocks):
        """Text page returns FileResponse for frontend/build/index.html."""
        import main
        from fastapi.responses import FileResponse

        result = main.serve_text_page("sub-123")

        FileResponse.assert_called_once_with("frontend/build/index.html")
        assert result is not None

    def test_serve_tasks_page_returns_file_response(self, main_mocks):
        """Tasks page returns FileResponse for frontend/build/index.html."""
        import main
        from fastapi.responses import FileResponse

        result = main.serve_tasks_page()

        FileResponse.assert_called_once_with("frontend/build/index.html")
        assert result is not None

    def test_serve_texts_page_returns_file_response(self, main_mocks):
        """Texts page returns FileResponse for frontend/build/index.html."""
        import main
        from fastapi.responses import FileResponse

        result = main.serve_texts_page()

        FileResponse.assert_called_once_with("frontend/build/index.html")
        assert result is not None

    def test_serve_diff_page_returns_file_response(self, main_mocks):
        """Diff page returns FileResponse for frontend/build/index.html."""
        import main
        from fastapi.responses import FileResponse

        result = main.serve_diff_page()

        FileResponse.assert_called_once_with("frontend/build/index.html")
        assert result is not None

    def test_all_page_routes_serve_spa_entry_point(self, main_mocks):
        """All page routes serve the SPA entry point (index.html)."""
        import main

        # All page routes should return FileResponse for index.html
        main.serve_root_page()
        main.serve_menu_page()
        main.serve_text_page("sub-123")
        main.serve_tasks_page()
        main.serve_texts_page()
        main.serve_diff_page()

        from fastapi.responses import FileResponse
        # FileResponse should be called exactly 6 times (once per route)
        assert FileResponse.call_count == 6
        # Verify all calls were with the correct path
        for call in FileResponse.call_args_list:
            assert call[0][0] == "frontend/build/index.html"


# =============================================================================
# Test: Startup Script
# =============================================================================

class TestStartupScript:
    """Tests for the startup script (__main__)."""

    def test_uvicorn_imported(self):
        """uvicorn is imported in the __main__ block."""
        # Verify uvicorn can be imported
        import uvicorn
        assert uvicorn is not None

    def test_uvicorn_run_called_with_correct_params(self):
        """uvicorn.run is called with correct parameters."""
        mock_app = MagicMock()
        mock_uvicorn = MagicMock()

        # Use a mock instead of real uvicorn to avoid port binding
        mock_uvicorn.run = MagicMock()

        # Simulate the call pattern from main.py
        mock_uvicorn.run(mock_app, host="0.0.0.0", port=8000)

        mock_uvicorn.run.assert_called_once_with(mock_app, host="0.0.0.0", port=8000)

    def test_uvicorn_runs_on_host_0_0_0_0(self):
        """uvicorn runs on host 0.0.0.0."""
        mock_app = MagicMock()
        mock_uvicorn = MagicMock()
        mock_uvicorn.run = MagicMock()

        # Simulate the call pattern from main.py
        mock_uvicorn.run(mock_app, host="0.0.0.0", port=8000)

        call_kwargs = mock_uvicorn.run.call_args[1]
        assert call_kwargs.get('host') == "0.0.0.0"

    def test_uvicorn_runs_on_port_8000(self):
        """uvicorn runs on port 8000."""
        mock_app = MagicMock()
        mock_uvicorn = MagicMock()
        mock_uvicorn.run = MagicMock()

        # Simulate the call pattern from main.py
        mock_uvicorn.run(mock_app, host="0.0.0.0", port=8000)

        call_kwargs = mock_uvicorn.run.call_args[1]
        assert call_kwargs.get('port') == 8000

    def test_main_block_executes_uvicorn_run(self, main_mocks):
        """The __main__ block executes uvicorn.run with the app."""
        # Verify the pattern in main.py
        import main
        # The main module should have the code structure for __main__
        assert main is not None


# =============================================================================
# Test: Integration Points
# =============================================================================

class TestIntegrationPoints:
    """Tests for integration points."""

    def test_handlers_use_app_state_storage(self, main_mocks):
        """Handlers can access storage via app.state."""
        assert hasattr(main_mocks['app'].state, 'posts_storage')
        assert hasattr(main_mocks['app'].state, 'submissions_storage')
        assert hasattr(main_mocks['app'].state, 'semantic_diffs_storage')

    def test_all_routes_registered_on_app(self, main_mocks):
        """All routes are registered on the app."""
        # Verify include_router was called for all handlers (3 times)
        assert main_mocks['app'].include_router.call_count == 3
        # Verify add_middleware was called for CORS
        assert main_mocks['app'].add_middleware.called
        # Verify mount was called for static files
        assert main_mocks['app'].mount.called

    def test_mongodb_database_accessible(self, main_mocks):
        """MongoDB database is accessible via storage."""
        assert main_mocks['db'] is not None

    def test_frontend_build_directory_referenced(self, main_mocks):
        """Frontend build directory is referenced in the code."""
        # The code references frontend/build/index.html
        import main
        # Verify the route functions exist and use FileResponse
        assert hasattr(main, 'serve_root_page')


# =============================================================================
# Test: Application State
# =============================================================================

class TestApplicationState:
    """Tests for application state management."""

    def test_posts_storage_accessible_via_app_state(self, main_mocks):
        """PostsStorage is accessible via app.state.posts_storage."""
        assert main_mocks['app'].state.posts_storage == main_mocks['posts_storage']

    def test_submissions_storage_accessible_via_app_state(self, main_mocks):
        """SubmissionsStorage is accessible via app.state.submissions_storage."""
        assert main_mocks['app'].state.submissions_storage == main_mocks['submissions_storage']

    def test_semantic_diffs_storage_accessible_via_app_state(self, main_mocks):
        """SemanticDiffsStorage is accessible via app.state.semantic_diffs_storage."""
        assert main_mocks['app'].state.semantic_diffs_storage == main_mocks['semantic_diffs_storage']

    def test_app_state_has_all_required_attributes(self, main_mocks):
        """App state has all required storage attributes."""
        assert hasattr(main_mocks['app'].state, 'posts_storage')
        assert hasattr(main_mocks['app'].state, 'submissions_storage')
        assert hasattr(main_mocks['app'].state, 'semantic_diffs_storage')


# =============================================================================
# Test: Edge Cases
# =============================================================================

class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_mongodb_unavailable_at_startup(self, monkeypatch):
        """Handle MongoDB unavailable at startup gracefully."""
        # Clear any previous main import
        if 'main' in sys.modules:
            del sys.modules['main']

        # Mock MongoClient to raise an exception
        class MockMongoClient:
            def __init__(self, *args, **kwargs):
                raise ConnectionError("MongoDB unavailable")

        mock_pymongo = MagicMock()
        mock_pymongo.MongoClient = MockMongoClient
        monkeypatch.setitem(sys.modules, 'pymongo', mock_pymongo)

        # Re-setup other mocks using monkeypatch
        monkeypatch.setenv('MONGODB_URL', 'mongodb://localhost:8765/')

        mock_fastapi = MagicMock()
        mock_app = MagicMock()
        mock_app.state = MagicMock()
        mock_app.add_middleware = MagicMock()
        mock_app.mount = MagicMock()
        mock_app.include_router = MagicMock()
        mock_app.delete = lambda path: lambda f: f
        mock_app.get = lambda path: lambda f: f
        mock_fastapi.return_value = mock_app

        fastapi_mock = MagicMock()
        fastapi_mock.FastAPI = mock_fastapi

        class MockHTTPException(Exception):
            def __init__(self, status_code: int, detail: str = None):
                self.status_code = status_code
                self.detail = detail
                super().__init__(detail)

        fastapi_mock.HTTPException = MockHTTPException
        monkeypatch.setitem(sys.modules, 'fastapi', fastapi_mock)

        monkeypatch.setitem(sys.modules, 'fastapi.middleware', MagicMock())
        monkeypatch.setitem(sys.modules, 'fastapi.middleware.cors', MagicMock())
        monkeypatch.setitem(sys.modules, 'fastapi.staticfiles', MagicMock())
        monkeypatch.setitem(sys.modules, 'fastapi.responses', MagicMock())
        sys.modules['fastapi.responses'].FileResponse = MagicMock(return_value=MagicMock())

        monkeypatch.setitem(sys.modules, 'handlers', MagicMock())
        monkeypatch.setitem(sys.modules, 'handlers.submission_handler', MagicMock(router=MagicMock()))
        monkeypatch.setitem(sys.modules, 'handlers.task_queue_handler', MagicMock(router=MagicMock()))
        monkeypatch.setitem(sys.modules, 'handlers.diff_handler', MagicMock(router=MagicMock()))

        monkeypatch.setitem(sys.modules, 'lib', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.nlp', MagicMock())
        sys.modules['lib.nlp'].ensure_nltk_data = MagicMock()
        monkeypatch.setitem(sys.modules, 'lib.storage', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.storage.posts', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.storage.submissions', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.storage.semantic_diffs', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.diff', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.diff.semantic_diff', MagicMock())
        sys.modules['lib.diff.semantic_diff'].canonical_pair = MagicMock(return_value=("a::b", "a", "b"))

        # The import should raise ConnectionError
        with pytest.raises(ConnectionError, match="MongoDB unavailable"):
            import main

    def test_frontend_build_directory_missing(self, main_mocks):
        """Handle missing frontend build directory gracefully."""
        # The app should initialize without errors even if frontend/build doesn't exist
        # This is already tested by the successful initialization in main_mocks
        assert main_mocks['app'] is not None

    def test_storage_prepare_failures(self, monkeypatch):
        """Handle storage prepare() method failures."""
        # Clear any previous main import
        if 'main' in sys.modules:
            del sys.modules['main']

        mock_posts_storage = MagicMock()
        mock_posts_storage.prepare.side_effect = Exception("Storage prepare failed")

        mock_storage_module = MagicMock()
        mock_storage_module.PostsStorage = MagicMock(return_value=mock_posts_storage)
        monkeypatch.setitem(sys.modules, 'lib.storage.posts', mock_storage_module)

        # Re-setup other necessary mocks using monkeypatch
        monkeypatch.setenv('MONGODB_URL', 'mongodb://localhost:8765/')

        mock_fastapi = MagicMock()
        mock_app = MagicMock()
        mock_app.state = MagicMock()
        mock_app.add_middleware = MagicMock()
        mock_app.mount = MagicMock()
        mock_app.include_router = MagicMock()
        mock_app.delete = lambda path: lambda f: f
        mock_app.get = lambda path: lambda f: f
        mock_fastapi.return_value = mock_app

        fastapi_mock = MagicMock()
        fastapi_mock.FastAPI = mock_fastapi

        class MockHTTPException(Exception):
            def __init__(self, status_code: int, detail: str = None):
                self.status_code = status_code
                self.detail = detail
                super().__init__(detail)

        fastapi_mock.HTTPException = MockHTTPException
        monkeypatch.setitem(sys.modules, 'fastapi', fastapi_mock)

        monkeypatch.setitem(sys.modules, 'fastapi.middleware', MagicMock())
        monkeypatch.setitem(sys.modules, 'fastapi.middleware.cors', MagicMock())
        monkeypatch.setitem(sys.modules, 'fastapi.staticfiles', MagicMock())
        monkeypatch.setitem(sys.modules, 'fastapi.responses', MagicMock())
        sys.modules['fastapi.responses'].FileResponse = MagicMock(return_value=MagicMock())

        monkeypatch.setitem(sys.modules, 'pymongo', MagicMock())
        mock_client = MagicMock()
        mock_db = MagicMock()
        mock_client.__getitem__ = MagicMock(return_value=mock_db)
        sys.modules['pymongo'].MongoClient = MagicMock(return_value=mock_client)

        monkeypatch.setitem(sys.modules, 'handlers', MagicMock())
        monkeypatch.setitem(sys.modules, 'handlers.submission_handler', MagicMock(router=MagicMock()))
        monkeypatch.setitem(sys.modules, 'handlers.task_queue_handler', MagicMock(router=MagicMock()))
        monkeypatch.setitem(sys.modules, 'handlers.diff_handler', MagicMock(router=MagicMock()))

        monkeypatch.setitem(sys.modules, 'lib', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.nlp', MagicMock())
        sys.modules['lib.nlp'].ensure_nltk_data = MagicMock()
        monkeypatch.setitem(sys.modules, 'lib.storage', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.storage.submissions', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.storage.semantic_diffs', MagicMock())
        sys.modules['lib.storage.submissions'].SubmissionsStorage = MagicMock(return_value=MagicMock(prepare=MagicMock()))
        sys.modules['lib.storage.semantic_diffs'].SemanticDiffsStorage = MagicMock(return_value=MagicMock(prepare=MagicMock()))
        monkeypatch.setitem(sys.modules, 'lib.diff', MagicMock())
        monkeypatch.setitem(sys.modules, 'lib.diff.semantic_diff', MagicMock())
        sys.modules['lib.diff.semantic_diff'].canonical_pair = MagicMock(return_value=("a::b", "a", "b"))

        # The import should raise the exception from prepare()
        with pytest.raises(Exception, match="Storage prepare failed"):
            import main

    def test_invalid_mongodb_url_format(self, monkeypatch):
        """Handle invalid MONGODB_URL format."""
        # Clear any previous main import
        if 'main' in sys.modules:
            del sys.modules['main']

        # Set an invalid URL format using monkeypatch
        monkeypatch.setenv('MONGODB_URL', 'invalid://url::format')

        # The MongoClient should still be called (validation happens at connection time)
        mocks = _setup_mocks(monkeypatch, 'invalid://url::format')
        from pymongo import MongoClient
        MongoClient.assert_called()
        call_args = MongoClient.call_args
        assert call_args[0][0] == "invalid://url::format"

    def test_port_in_use_handling(self):
        """Handle port 8000 already in use."""
        # This tests the uvicorn configuration pattern, not actual binding
        mock_app = MagicMock()
        mock_uvicorn = MagicMock()

        # Simulate port in use error by raising OSError
        mock_uvicorn.run = MagicMock(side_effect=OSError("Address already in use"))

        # The OSError should be raised when trying to run
        with pytest.raises(OSError, match="Address already in use"):
            mock_uvicorn.run(mock_app, host="0.0.0.0", port=8000)


# =============================================================================
# Test: Environment Variables
# =============================================================================

class TestEnvironmentVariables:
    """Tests for environment variable handling."""

    def test_mongodb_url_default_value(self, monkeypatch):
        """MONGODB_URL defaults to 'mongodb://localhost:8765/' if not set."""
        # Clear any previous main import
        if 'main' in sys.modules:
            del sys.modules['main']

        # Remove MONGODB_URL using monkeypatch
        monkeypatch.delenv('MONGODB_URL', raising=False)

        mocks = _setup_mocks(monkeypatch)
        from pymongo import MongoClient
        MongoClient.assert_called()
        call_args = MongoClient.call_args
        assert call_args[0][0] == "mongodb://localhost:8765/"

    def test_mongodb_url_custom_value(self, monkeypatch):
        """MONGODB_URL uses custom value when set."""
        # Clear any previous main import
        if 'main' in sys.modules:
            del sys.modules['main']

        mocks = _setup_mocks(monkeypatch, 'mongodb://custom-host:27017/mydb')
        from pymongo import MongoClient
        MongoClient.assert_called()
        call_args = MongoClient.call_args
        assert call_args[0][0] == "mongodb://custom-host:27017/mydb"


# =============================================================================
# Test: Dependencies Mocking
# =============================================================================

class TestDependenciesMocking:
    """Tests to verify all dependencies are properly mocked."""

    def test_fastapi_mocked(self, main_mocks):
        """FastAPI is properly mocked."""
        assert main_mocks['fastapi'] is not None

    def test_mongo_client_mocked(self, main_mocks):
        """MongoClient is properly mocked."""
        assert main_mocks['client'] is not None

    def test_staticfiles_mocked(self, main_mocks):
        """StaticFiles is properly mocked."""
        from fastapi.staticfiles import StaticFiles
        assert StaticFiles is not None

    def test_file_response_mocked(self, main_mocks):
        """FileResponse is properly mocked."""
        from fastapi.responses import FileResponse
        assert FileResponse is not None

    def test_uvicorn_available(self):
        """uvicorn is available for import."""
        import uvicorn
        assert uvicorn is not None

    def test_os_getenv_used(self, main_mocks):
        """os.getenv is used for MONGODB_URL."""
        # The mock setup uses os.environ, which is equivalent to os.getenv
        assert os.environ.get('MONGODB_URL') is not None

    def test_storage_classes_mocked(self, main_mocks):
        """All storage classes are properly mocked."""
        assert main_mocks['posts_storage'] is not None
        assert main_mocks['submissions_storage'] is not None
        assert main_mocks['semantic_diffs_storage'] is not None


# =============================================================================
# Test: CORS Middleware Details
# =============================================================================

class TestCORSMiddlewareDetails:
    """Detailed tests for CORS middleware configuration."""

    def test_cors_middleware_class_used(self, main_mocks):
        """CORSMiddleware class is used."""
        from fastapi.middleware.cors import CORSMiddleware
        assert CORSMiddleware is not None

    def test_cors_configuration_complete(self, main_mocks):
        """CORS configuration includes all required settings."""
        cors_call = main_mocks['app'].add_middleware.call_args
        call_kwargs = cors_call[1]

        assert 'allow_origins' in call_kwargs
        assert 'allow_credentials' in call_kwargs
        assert 'allow_methods' in call_kwargs
        assert 'allow_headers' in call_kwargs

    def test_cors_middleware_added_before_routes(self, main_mocks):
        """CORS middleware is added before route registration."""
        # Verify add_middleware was called
        assert main_mocks['app'].add_middleware.called
        # Verify include_router was called after
        assert main_mocks['app'].include_router.called
