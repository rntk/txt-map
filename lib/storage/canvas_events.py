import logging
from datetime import datetime, UTC
from typing import Any, List

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
        try:
            self._db.canvas_events.create_index([("article_id", 1), ("seq", 1)])
        except Exception as e:
            self._log.warning("Can't create compound index. Info: %s", e)

    def add_event(
        self, article_id: str, event_type: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        seq = self._db.canvas_events.count_documents({"article_id": article_id})
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
