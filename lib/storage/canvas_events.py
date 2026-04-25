import logging
from datetime import datetime, UTC
from typing import Any, List

from pymongo import ReturnDocument
from pymongo.database import Database


class CanvasEventsStorage:
    indexes: List[str] = ["article_id"]

    def __init__(self, db: Database) -> None:
        self._db = db
        self._log = logging.getLogger("canvas_events")

    def prepare(self) -> None:
        for index in self.indexes:
            try:
                self._db.canvas_events.create_index(index)
            except Exception as e:
                self._log.warning(
                    "Can't create index %s. May be already exists. Info: %s", index, e
                )
        self._ensure_unique_seq_index()
        self._backfill_counters()

    def _ensure_unique_seq_index(self) -> None:
        target_key = [("article_id", 1), ("seq", 1)]
        try:
            existing = self._db.canvas_events.index_information()
            for name, info in existing.items():
                if list(info.get("key", [])) == target_key and not info.get("unique"):
                    self._db.canvas_events.drop_index(name)
                    break
            self._db.canvas_events.create_index(target_key, unique=True)
        except Exception as e:
            self._log.warning("Can't ensure unique compound index. Info: %s", e)

    def _backfill_counters(self) -> None:
        # Counters were introduced after add_event already used count_documents
        # to derive seq. For any article that has events but no counter row,
        # seed the counter to max(seq) so the next $inc returns max+1.
        try:
            pipeline = [
                {"$group": {"_id": "$article_id", "max_seq": {"$max": "$seq"}}}
            ]
            for doc in self._db.canvas_events.aggregate(pipeline):
                article_id = doc["_id"]
                max_seq = doc.get("max_seq")
                if max_seq is None:
                    continue
                self._db.canvas_events_counters.update_one(
                    {"_id": article_id},
                    {"$max": {"seq": int(max_seq)}},
                    upsert=True,
                )
        except Exception as e:
            self._log.warning("Can't backfill canvas event counters. Info: %s", e)

    def _next_seq(self, article_id: str) -> int:
        doc = self._db.canvas_events_counters.find_one_and_update(
            {"_id": article_id},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return int(doc["seq"])

    def add_event(
        self, article_id: str, event_type: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        seq = self._next_seq(article_id)
        event = {
            "article_id": article_id,
            "event_type": event_type,
            "data": data,
            "created_at": datetime.now(UTC),
            "seq": seq,
        }
        self._db.canvas_events.insert_one(event)
        event["_id"] = str(event["_id"])
        return event

    def get_events(
        self, article_id: str, offset: int = 0, limit: int = 50
    ) -> List[dict[str, Any]]:
        cursor = (
            self._db.canvas_events.find({"article_id": article_id})
            .sort("seq", 1)
            .skip(offset)
            .limit(limit)
        )
        events = []
        for doc in cursor:
            doc["_id"] = str(doc["_id"])
            events.append(doc)
        return events

    def delete_event(self, article_id: str, seq: int) -> bool:
        result = self._db.canvas_events.delete_one(
            {"article_id": article_id, "seq": seq}
        )
        return result.deleted_count > 0
