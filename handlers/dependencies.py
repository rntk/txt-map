from fastapi import Depends, HTTPException, Request
from typing import Dict, Any

from lib.storage.app_settings import AppSettingsStorage
from lib.storage.submissions import SubmissionsStorage
from lib.storage.semantic_diffs import SemanticDiffsStorage
from lib.storage.task_queue import TaskQueueStorage
from lib.storage.llm_cache import MongoLLMCacheStore
from lib.storage.tokens import TokenStorage
from lib.llm_queue.store import LLMQueueStore


def get_submissions_storage(request: Request) -> SubmissionsStorage:
    return request.app.state.submissions_storage


def get_task_queue_storage(request: Request) -> TaskQueueStorage:
    return request.app.state.task_queue_storage


def get_semantic_diffs_storage(request: Request) -> SemanticDiffsStorage:
    return request.app.state.semantic_diffs_storage


def get_app_settings_storage(request: Request) -> AppSettingsStorage:
    return request.app.state.app_settings_storage


def get_cache_store(request: Request) -> MongoLLMCacheStore:
    return request.app.state.llm_cache_store


def get_llm_queue_store(request: Request) -> LLMQueueStore:
    return request.app.state.llm_queue_store


class _DisabledTokenStorage(TokenStorage):
    """No-op token storage used when auth is disabled (SUPER_TOKEN not set).

    All read operations return empty results; writes raise RuntimeError since
    token management requires auth to be enabled.
    """

    def __init__(self) -> None:
        pass  # skip super().__init__() — no DB connection needed

    def prepare(self) -> None:
        pass

    def find_by_hash(self, token_hash: str):
        return None

    def get_all_tokens(self):
        return []

    def create_token(self, *args, **kwargs):
        raise RuntimeError("Token management requires auth to be enabled (set SUPER_TOKEN).")

    def delete_token(self, *args, **kwargs):
        raise RuntimeError("Token management requires auth to be enabled (set SUPER_TOKEN).")


_disabled_token_storage = _DisabledTokenStorage()


def get_token_storage(request: Request) -> TokenStorage:
    """Get token storage from app state.

    When auth is disabled (SUPER_TOKEN not set), returns a no-op stub so that
    callers can call find_by_hash() safely without a real DB connection.
    """
    from handlers.auth_handler import SUPER_TOKEN

    storage = getattr(request.app.state, "token_storage", None)
    if storage is None and not SUPER_TOKEN:
        return _disabled_token_storage
    if storage is None:
        raise AttributeError(
            "token_storage not found in app.state. "
            "Ensure lifespan sets up token_storage or disable auth by not setting SUPER_TOKEN."
        )
    return storage


def require_submission(
    submission_id: str,
    storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> Dict[str, Any]:
    """Dependency that resolves {submission_id} from the path and raises 404 if not found."""
    sub = storage.get_by_id(submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    return sub
