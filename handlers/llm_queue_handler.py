from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List, Dict, Any

from lib.llm_queue.store import LLMQueueStore
from handlers.dependencies import get_llm_queue_store

router = APIRouter()


@router.get("/llm-queue")
def list_llm_queue(
    status: Optional[str] = None,
    limit: int = 100,
    llm_queue_store: LLMQueueStore = Depends(get_llm_queue_store),
) -> Dict[str, List[Dict[str, Any]]]:
    """List LLM queue entries with optional filters."""
    if limit <= 0:
        raise HTTPException(status_code=400, detail="Limit must be positive")

    query = {}
    if status:
        query["status"] = status

    tasks = llm_queue_store.list(query, limit)

    serialized = []
    for task in tasks:
        t = dict(task)
        # remove response since it could be huge and not needed for a list view
        if "response" in t:
            del t["response"]
        serialized.append(t)

    return {"tasks": serialized}


@router.delete("/llm-queue/{request_id}")
def delete_llm_queue_entry(
    request_id: str,
    llm_queue_store: LLMQueueStore = Depends(get_llm_queue_store),
) -> Dict[str, Any]:
    """Delete an LLM queue entry by its ID."""
    deleted = llm_queue_store.delete_by_id(request_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="LLM Task not found")

    return {"deleted": True, "request_id": request_id}
