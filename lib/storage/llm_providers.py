from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from pymongo.collection import Collection
from pymongo.database import Database


VALID_TYPES = ("openai", "anthropic", "openai_comp")


class LlmProvidersStorage:
    def __init__(self, db: Database) -> None:
        self._db: Database = db
        self._collection: Collection = db.llm_providers

    @property
    def db(self) -> Database:
        return self._db

    def prepare(self) -> None:
        try:
            self._collection.create_index("created_at")
        except Exception:
            pass

    def list_providers(self) -> list[dict[str, Any]]:
        docs = self._collection.find({}, {"token_encrypted": 0}).sort("created_at", -1)
        result = []
        for doc in docs:
            doc["_id"] = str(doc["_id"])
            result.append(doc)
        return result

    def get_provider(self, provider_id: str) -> dict[str, Any] | None:
        try:
            oid = ObjectId(provider_id)
        except Exception:
            return None
        doc = self._collection.find_one({"_id": oid})
        if doc is None:
            return None
        doc["_id"] = str(doc["_id"])
        return doc

    def create_provider(
        self,
        name: str,
        provider_type: str,
        model: str,
        url: str | None,
        token_encrypted: str,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "name": name,
            "type": provider_type,
            "model": model,
            "url": url,
            "token_encrypted": token_encrypted,
            "created_at": now,
        }
        result = self._collection.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return doc

    def delete_provider(self, provider_id: str) -> bool:
        try:
            oid = ObjectId(provider_id)
        except Exception:
            return False
        result = self._collection.delete_one({"_id": oid})
        return result.deleted_count > 0
