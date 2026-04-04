"""
Mock setup for main.py tests.

This module provides access to the mocks set up in conftest.py.
The mocks are set up before the main module is imported to prevent
import-time hanging.
"""

import sys

# Import the mocks from conftest
from tests.conftest import _main_mocks as MOCKS

# If conftest didn't set up mocks, set them up here
if not MOCKS:
    from unittest.mock import MagicMock

    # Create mock objects
    mock_fastapi = MagicMock()
    mock_app = MagicMock()
    mock_app.state = MagicMock()
    mock_app.add_middleware = MagicMock()
    mock_app.mount = MagicMock()
    mock_app.include_router = MagicMock()
    mock_app.delete = MagicMock()
    mock_app.get = MagicMock()
    mock_fastapi.return_value = mock_app

    # Set up sys.modules mocks
    sys.modules["fastapi"] = MagicMock()
    sys.modules["fastapi"].FastAPI = mock_fastapi
    sys.modules["fastapi"].HTTPException = Exception

    sys.modules["fastapi.middleware"] = MagicMock()
    sys.modules["fastapi.middleware.cors"] = MagicMock()
    sys.modules["fastapi.middleware.cors"].CORSMiddleware = MagicMock()

    sys.modules["fastapi.staticfiles"] = MagicMock()
    sys.modules["fastapi.staticfiles"].StaticFiles = MagicMock()

    sys.modules["fastapi.responses"] = MagicMock()
    sys.modules["fastapi.responses"].FileResponse = MagicMock(return_value=MagicMock())

    sys.modules["pymongo"] = MagicMock()
    mock_client = MagicMock()
    mock_db = MagicMock()
    mock_client.__getitem__ = MagicMock(return_value=mock_db)
    sys.modules["pymongo"].MongoClient = MagicMock(return_value=mock_client)

    # Mock handlers
    sys.modules["handlers"] = MagicMock()

    mock_submission_handler = MagicMock()
    mock_submission_handler.router = MagicMock()
    sys.modules["handlers.submission_handler"] = mock_submission_handler

    mock_task_queue_handler = MagicMock()
    mock_task_queue_handler.router = MagicMock()
    sys.modules["handlers.task_queue_handler"] = mock_task_queue_handler

    mock_diff_handler = MagicMock()
    mock_diff_handler.router = MagicMock()
    sys.modules["handlers.diff_handler"] = mock_diff_handler

    # Mock lib modules
    sys.modules["lib"] = MagicMock()
    sys.modules["lib.nlp"] = MagicMock()
    sys.modules["lib.nlp"].ensure_nltk_data = MagicMock()

    sys.modules["lib.storage"] = MagicMock()
    sys.modules["lib.storage.posts"] = MagicMock()
    sys.modules["lib.storage.submissions"] = MagicMock()
    sys.modules["lib.storage.semantic_diffs"] = MagicMock()

    mock_posts_storage = MagicMock()
    mock_posts_storage.prepare = MagicMock()
    sys.modules["lib.storage.posts"].PostsStorage = MagicMock(
        return_value=mock_posts_storage
    )

    mock_submissions_storage = MagicMock()
    mock_submissions_storage.prepare = MagicMock()
    sys.modules["lib.storage.submissions"].SubmissionsStorage = MagicMock(
        return_value=mock_submissions_storage
    )

    mock_semantic_diffs_storage = MagicMock()
    mock_semantic_diffs_storage.prepare = MagicMock()
    sys.modules["lib.storage.semantic_diffs"].SemanticDiffsStorage = MagicMock(
        return_value=mock_semantic_diffs_storage
    )

    sys.modules["lib.diff"] = MagicMock()
    sys.modules["lib.diff.semantic_diff"] = MagicMock()
    sys.modules["lib.diff.semantic_diff"].canonical_pair = MagicMock(
        return_value=("sub-a::sub-b", "sub-a", "sub-b")
    )

    MOCKS = {
        "app": mock_app,
        "client": mock_client,
        "db": mock_db,
        "posts_storage": mock_posts_storage,
        "submissions_storage": mock_submissions_storage,
        "semantic_diffs_storage": mock_semantic_diffs_storage,
        "fastapi": mock_fastapi,
        "submission_handler": mock_submission_handler,
        "task_queue_handler": mock_task_queue_handler,
        "diff_handler": mock_diff_handler,
    }
