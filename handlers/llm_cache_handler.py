from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional

router = APIRouter()


def get_cache_store(request: Request):
    return request.app.state.llm_cache_store


@router.get("/llm-cache/stats")
def get_cache_stats(cache_store=Depends(get_cache_store)):
    """Return entry counts grouped by namespace."""
    stats = cache_store.get_stats()
    total = cache_store.count_entries()
    return {"namespaces": stats, "total": total}


@router.get("/llm-cache")
def list_cache_entries(
    namespace: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    cache_store=Depends(get_cache_store),
):
    """List cache entries with optional namespace filter."""
    if limit <= 0 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
    entries = cache_store.list_entries(namespace=namespace, limit=limit, skip=skip)
    total = cache_store.count_entries(namespace=namespace)
    return {"entries": entries, "total": total, "limit": limit, "skip": skip}


@router.delete("/llm-cache/entry/{entry_id}")
def delete_cache_entry(entry_id: str, cache_store=Depends(get_cache_store)):
    """Delete a single cache entry by its MongoDB document ID."""
    deleted = cache_store.delete_entry_by_id(entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cache entry not found")
    return {"deleted": True, "entry_id": entry_id}


@router.delete("/llm-cache")
def clear_cache(namespace: Optional[str] = None, cache_store=Depends(get_cache_store)):
    """Delete all cache entries, or all entries for a specific namespace."""
    if namespace:
        count = cache_store.delete_by_namespace(namespace)
        return {"deleted": True, "namespace": namespace, "deleted_count": count}
    count = cache_store.delete_all()
    return {"deleted": True, "deleted_count": count}
