"""MongoDB-backed LLM cache store implementing txt_splitt's LLMCacheStore protocol."""

from datetime import datetime, UTC

from txt_splitt.cache import CacheEntry


class MongoLLMCacheStore:
    """MongoDB-backed cache store implementing txt_splitt LLMCacheStore protocol."""

    def __init__(self, db):
        self._collection = db.llm_cache

    def prepare(self):
        """Create indexes for the cache collection."""
        # Drop stale legacy index if present
        try:
            self._collection.drop_index("prompt_hash_1")
        except Exception:
            pass
        try:
            self._collection.create_index("key", unique=True)
        except Exception:
            pass
        try:
            self._collection.create_index("namespace")
        except Exception:
            pass
        try:
            self._collection.create_index("created_at")
        except Exception:
            pass

    def get(self, key: str) -> CacheEntry | None:
        doc = self._collection.find_one({"key": key})
        if doc is None:
            return None
        return CacheEntry(
            key=doc["key"],
            response=doc["response"],
            created_at=float(doc["created_at"]),
            namespace=doc["namespace"],
            model_id=doc.get("model_id"),
            prompt_version=doc.get("prompt_version"),
            temperature=float(doc["temperature"]),
        )

    def set(self, entry: CacheEntry) -> None:
        self._collection.update_one(
            {"key": entry.key},
            {
                "$set": {
                    "key": entry.key,
                    "response": entry.response,
                    "created_at": entry.created_at,
                    "namespace": entry.namespace,
                    "model_id": entry.model_id,
                    "prompt_version": entry.prompt_version,
                    "temperature": entry.temperature,
                    "stored_at": datetime.now(UTC).isoformat(),
                }
            },
            upsert=True,
        )

    # --- Management API methods ---

    def list_entries(self, namespace: str | None = None, limit: int = 100, skip: int = 0) -> list[dict]:
        query: dict = {}
        if namespace:
            query["namespace"] = namespace
        cursor = self._collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
        result = []
        for doc in cursor:
            doc_copy = {k: v for k, v in doc.items() if k != "_id"}
            doc_copy["id"] = str(doc["_id"])
            result.append(doc_copy)
        return result

    def count_entries(self, namespace: str | None = None) -> int:
        query: dict = {}
        if namespace:
            query["namespace"] = namespace
        return self._collection.count_documents(query)

    def delete_entry_by_id(self, entry_id: str) -> bool:
        from bson import ObjectId
        try:
            obj_id = ObjectId(entry_id)
        except Exception:
            return False
        result = self._collection.delete_one({"_id": obj_id})
        return result.deleted_count > 0

    def delete_by_namespace(self, namespace: str) -> int:
        result = self._collection.delete_many({"namespace": namespace})
        return result.deleted_count

    def delete_all(self) -> int:
        result = self._collection.delete_many({})
        return result.deleted_count

    def get_namespaces(self) -> list[str]:
        return self._collection.distinct("namespace")

    def get_stats(self) -> list[dict]:
        pipeline = [
            {"$group": {"_id": "$namespace", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        return [{"namespace": r["_id"], "count": r["count"]} for r in self._collection.aggregate(pipeline)]
