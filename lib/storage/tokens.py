"""Token storage for user access tokens."""

import logging
from datetime import UTC, datetime
from typing import Any

from bson.errors import InvalidId
from bson.objectid import ObjectId
from pymongo.collection import Collection
from pymongo.database import Database

logger = logging.getLogger(__name__)


class TokenStorage:
    """Storage for user access tokens (not super token)."""

    def __init__(self, db: Database) -> None:
        self._db: Database = db
        self._collection: Collection = db.tokens

    def prepare(self) -> None:
        """Create indexes for tokens collection."""
        try:
            self._collection.create_index("token_hash", unique=True)
            self._collection.create_index("created_at")
        except Exception as e:
            logger.warning("Failed to create tokens collection indexes: %s", e)

    def create_token(
        self, token_hash: str, alias: str, notes: str, created_by: str
    ) -> dict[str, Any]:
        """Create a new user token. Stores only the hash."""
        now = datetime.now(UTC)
        doc = {
            "token_hash": token_hash,
            "alias": alias,
            "notes": notes,
            "created_at": now,
            "created_by": created_by,
        }
        result = self._collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    def delete_token(self, token_id: str) -> bool:
        """Delete a token by its _id. Returns True if deleted."""
        try:
            result = self._collection.delete_one({"_id": ObjectId(token_id)})
            return result.deleted_count > 0
        except InvalidId:
            return False

    def get_all_tokens(self) -> list[dict[str, Any]]:
        """Get all tokens without the hash field."""
        tokens = (
            self._collection.find({}, {"token_hash": 0})
            .sort("created_at", -1)
            .limit(1000)
        )
        return list(tokens)

    def find_by_hash(self, token_hash: str) -> dict[str, Any] | None:
        """Find a token by its hash. Returns None if not found."""
        return self._collection.find_one({"token_hash": token_hash})
