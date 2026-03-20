from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, Dict, Any, List

from handlers.dependencies import get_cache_store
from lib.storage.llm_cache import MongoLLMCacheStore

router = APIRouter()


@router.get("/llm-cache/stats")
def get_cache_stats(
    cache_store: MongoLLMCacheStore = Depends(get_cache_store)
) -> Dict[str, Any]:
    """Return entry counts grouped by namespace."""
    return {
        "namespaces": cache_store.get_stats(),
        "total": cache_store.count_entries()
    }


@router.get("/llm-cache")
def list_cache_entries(
    namespace: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    cache_store: MongoLLMCacheStore = Depends(get_cache_store),
) -> Dict[str, Any]:
    """List cache entries with optional namespace filter."""
    if not (0 < limit <= 500):
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
        
    entries = cache_store.list_entries(namespace=namespace, limit=limit, skip=skip)
    total = cache_store.count_entries(namespace=namespace)
    
    return {
        "entries": entries,
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.delete("/llm-cache/entry/{entry_id}")
def delete_cache_entry(
    entry_id: str,
    cache_store: MongoLLMCacheStore = Depends(get_cache_store)
) -> Dict[str, Any]:
    """Delete a single cache entry by its MongoDB document ID."""
    if not cache_store.delete_entry_by_id(entry_id):
        raise HTTPException(status_code=404, detail="Cache entry not found")
        
    return {"deleted": True, "entry_id": entry_id}


@router.delete("/llm-cache")
def clear_cache(
    namespace: Optional[str] = None,
    cache_store: MongoLLMCacheStore = Depends(get_cache_store)
) -> Dict[str, Any]:
    """Delete all cache entries, or all entries for a specific namespace."""
    if namespace:
        count = cache_store.delete_by_namespace(namespace)
        return {"deleted": True, "namespace": namespace, "deleted_count": count}
        
    count = cache_store.delete_all()
    return {"deleted": True, "deleted_count": count}
