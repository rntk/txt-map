from datetime import UTC, datetime
from typing import Any

from pymongo.database import Database
from pymongo.collection import Collection


class AppSettingsStorage:
    def __init__(self, db: Database) -> None:
        self._db: Database = db
        self._collection: Collection = db.app_settings

    @property
    def db(self) -> Database:
        return self._db

    def prepare(self) -> None:
        try:
            self._collection.create_index("updated_at")
        except Exception:
            pass

    def get_llm_runtime_config(self) -> dict[str, Any] | None:
        return self._collection.find_one({"_id": "llm_runtime_config"})

    def set_llm_runtime_config(self, provider: str, model: str) -> dict[str, Any]:
        now = datetime.now(UTC)
        self._collection.update_one(
            {"_id": "llm_runtime_config"},
            {
                "$set": {
                    "provider": provider,
                    "model": model,
                    "updated_at": now,
                }
            },
            upsert=True,
        )
        return {
            "_id": "llm_runtime_config",
            "provider": provider,
            "model": model,
            "updated_at": now,
        }
