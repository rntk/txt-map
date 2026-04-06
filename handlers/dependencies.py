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


def get_token_storage(request: Request) -> TokenStorage:
    return request.app.state.token_storage


def require_submission(
    submission_id: str,
    storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> Dict[str, Any]:
    """Dependency that resolves {submission_id} from the path and raises 404 if not found."""
    sub = storage.get_by_id(submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    return sub
