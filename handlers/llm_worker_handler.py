from datetime import UTC
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from handlers.dependencies import get_cache_store, get_llm_queue_store
from lib.llm_queue.store import LLMQueueStore
from lib.storage.llm_cache import MongoLLMCacheStore
from txt_splitt.cache import CacheEntry

router = APIRouter()

DEFAULT_REMOTE_LEASE_SECONDS = 60


class ClaimRequest(BaseModel):
    worker_id: str = Field(min_length=1)
    supported_model_ids: list[str] | None = None


class ClaimedTask(BaseModel):
    request_id: str
    lease_id: str
    lease_expires_at: str
    prompt: str
    temperature: float
    requested_provider: str | None = None
    requested_model: str | None = None
    requested_model_id: str | None = None
    cache_namespace: str | None = None
    prompt_version: str | None = None


class ClaimResponse(BaseModel):
    task: ClaimedTask | None


class LeaseRequest(BaseModel):
    worker_id: str = Field(min_length=1)
    lease_id: str = Field(min_length=1)


class HeartbeatResponse(BaseModel):
    ok: bool
    lease_expires_at: str


class CompleteRequest(LeaseRequest):
    response: str
    executed_provider: str
    executed_model: str
    executed_model_id: str | None = None


class FailRequest(LeaseRequest):
    error: str


class TaskMutationResponse(BaseModel):
    ok: bool
    request_id: str


def _get_lease_seconds() -> int:
    return DEFAULT_REMOTE_LEASE_SECONDS


def _serialize_claimed_task(task: dict[str, Any]) -> ClaimedTask:
    lease_expires_at = task.get("lease_expires_at")
    if lease_expires_at is None:
        raise ValueError("Claimed task is missing lease_expires_at")

    return ClaimedTask(
        request_id=task["request_id"],
        lease_id=task["lease_id"],
        lease_expires_at=lease_expires_at.astimezone(UTC).isoformat(),
        prompt=task["prompt"],
        temperature=float(task.get("temperature", 0.0)),
        requested_provider=task.get("requested_provider"),
        requested_model=task.get("requested_model"),
        requested_model_id=task.get("requested_model_id") or task.get("model_id"),
        cache_namespace=task.get("cache_namespace"),
        prompt_version=task.get("prompt_version"),
    )


def _require_task(request_id: str, llm_queue_store: LLMQueueStore) -> dict[str, Any]:
    task = llm_queue_store.get_result(request_id)
    if task is None:
        raise HTTPException(status_code=404, detail="LLM task not found")
    return task


def _validate_executed_model(
    task: dict[str, Any],
    executed_provider: str,
    executed_model: str,
    executed_model_id: str | None,
) -> str:
    requested_provider = task.get("requested_provider")
    requested_model = task.get("requested_model")
    requested_model_id = task.get("requested_model_id") or task.get("model_id")
    resolved_executed_model_id = (
        executed_model_id or f"{executed_provider.lower()}:{executed_model}"
    )

    if requested_model_id and resolved_executed_model_id != requested_model_id:
        raise HTTPException(
            status_code=409,
            detail="Executed model_id does not match queued request",
        )
    if not requested_model_id:
        if requested_provider and executed_provider != requested_provider:
            raise HTTPException(
                status_code=409,
                detail="Executed provider does not match queued request",
            )
        if requested_model and executed_model != requested_model:
            raise HTTPException(
                status_code=409,
                detail="Executed model does not match queued request",
            )

    return resolved_executed_model_id


def _write_cache_entry(
    task: dict[str, Any],
    response: str,
    executed_model_id: str,
    cache_store: MongoLLMCacheStore,
) -> None:
    cache_key = task.get("cache_key")
    if not cache_key:
        return

    cache_store.set(
        CacheEntry(
            key=cache_key,
            response=response,
            created_at=time.time(),
            namespace=task.get("cache_namespace") or "",
            model_id=executed_model_id,
            prompt_version=task.get("prompt_version"),
            temperature=float(task.get("temperature", 0.0)),
        )
    )


@router.post("/llm-workers/claim", response_model=ClaimResponse)
def claim_llm_task(
    body: ClaimRequest,
    llm_queue_store: LLMQueueStore = Depends(get_llm_queue_store),
) -> ClaimResponse:
    if not body.supported_model_ids:
        return ClaimResponse(task=None)

    task = llm_queue_store.claim(
        body.worker_id,
        worker_kind="remote",
        lease_seconds=_get_lease_seconds(),
        supported_model_ids=body.supported_model_ids,
        include_legacy_model_ids=False,
    )
    if task is None:
        return ClaimResponse(task=None)
    return ClaimResponse(task=_serialize_claimed_task(task))


@router.post(
    "/llm-workers/tasks/{request_id}/heartbeat", response_model=HeartbeatResponse
)
def heartbeat_llm_task(
    request_id: str,
    body: LeaseRequest,
    llm_queue_store: LLMQueueStore = Depends(get_llm_queue_store),
) -> HeartbeatResponse:
    updated_task = llm_queue_store.heartbeat(
        request_id,
        body.worker_id,
        body.lease_id,
        lease_seconds=_get_lease_seconds(),
    )
    if updated_task is None:
        raise HTTPException(status_code=409, detail="LLM task lease is no longer valid")
    return HeartbeatResponse(
        ok=True,
        lease_expires_at=updated_task["lease_expires_at"].astimezone(UTC).isoformat(),
    )


@router.post(
    "/llm-workers/tasks/{request_id}/complete", response_model=TaskMutationResponse
)
def complete_llm_task(
    request_id: str,
    body: CompleteRequest,
    llm_queue_store: LLMQueueStore = Depends(get_llm_queue_store),
    cache_store: MongoLLMCacheStore = Depends(get_cache_store),
) -> TaskMutationResponse:
    task = _require_task(request_id, llm_queue_store)
    executed_model_id = _validate_executed_model(
        task,
        executed_provider=body.executed_provider,
        executed_model=body.executed_model,
        executed_model_id=body.executed_model_id,
    )

    completed = llm_queue_store.complete(
        request_id,
        body.response,
        worker_id=body.worker_id,
        lease_id=body.lease_id,
        executed_provider=body.executed_provider,
        executed_model=body.executed_model,
        executed_model_id=executed_model_id,
    )
    if not completed:
        raise HTTPException(status_code=409, detail="LLM task lease is no longer valid")

    _write_cache_entry(task, body.response, executed_model_id, cache_store)
    return TaskMutationResponse(ok=True, request_id=request_id)


@router.post(
    "/llm-workers/tasks/{request_id}/fail", response_model=TaskMutationResponse
)
def fail_llm_task(
    request_id: str,
    body: FailRequest,
    llm_queue_store: LLMQueueStore = Depends(get_llm_queue_store),
) -> TaskMutationResponse:
    failed = llm_queue_store.fail(
        request_id,
        body.error,
        worker_id=body.worker_id,
        lease_id=body.lease_id,
    )
    if not failed:
        raise HTTPException(status_code=409, detail="LLM task lease is no longer valid")
    return TaskMutationResponse(ok=True, request_id=request_id)
