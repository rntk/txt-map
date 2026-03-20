import logging
import uuid
from typing import Optional, List, Any, Dict
from datetime import datetime, UTC

from pymongo.database import Database


class SubmissionsStorage:
    indexes: List[str] = ["submission_id", "created_at"]
    task_names: List[str] = ["split_topic_generation", "subtopics_generation", "summarization", "mindmap", "prefix_tree"]
    task_dependencies: Dict[str, List[str]] = {
        "split_topic_generation": [],
        "subtopics_generation": ["split_topic_generation"],
        "summarization": ["split_topic_generation"],
        "mindmap": ["split_topic_generation"],
        "prefix_tree": ["split_topic_generation"],
    }

    def __init__(self, db: Database) -> None:
        self._db: Database = db
        self._log = logging.getLogger("submissions")

    def prepare(self) -> None:
        for index in self.indexes:
            try:
                self._db.submissions.create_index(index)
            except Exception as e:
                self._log.warning(
                    "Can't create index %s. May be already exists. Info: %s", index, e
                )

    def create(
        self,
        html_content: str,
        text_content: str = "",
        source_url: str = ""
    ) -> dict[str, Any]:
        """Create a new submission and return the document"""
        submission_id = str(uuid.uuid4())
        now = datetime.now(UTC)

        submission = {
            "submission_id": submission_id,
            "html_content": html_content,
            "text_content": text_content,
            "source_url": source_url,
            "created_at": now,
            "updated_at": now,
            "tasks": {
                "split_topic_generation": {
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "error": None
                },
                "subtopics_generation": {
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "error": None
                },
                "summarization": {
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "error": None
                },
                "mindmap": {
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "error": None
                },
                "prefix_tree": {
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "error": None
                }
            },
            "read_topics": [],
            "results": {
                "sentences": [],
                "topics": [],
                "topic_summaries": {},
                "article_summary": {
                    "text": "",
                    "bullets": []
                },
                "topic_mindmaps": {},
                "mindmap_results": [],
                "subtopics": [],
                "summary": [],
                "summary_mappings": [],
                "prefix_tree": {}
            }
        }

        self._db.submissions.insert_one(submission)
        return submission

    def get_by_id(self, submission_id: str) -> Optional[dict[str, Any]]:
        """Get submission by submission_id"""
        return self._db.submissions.find_one({"submission_id": submission_id})

    def update_task_status(
        self,
        submission_id: str,
        task_name: str,
        status: str,
        error: Optional[str] = None
    ) -> bool:
        """Update task status (pending, processing, completed, failed)"""
        now = datetime.now(UTC)
        update_fields: dict[str, Any] = {
            f"tasks.{task_name}.status": status,
            "updated_at": now
        }

        if status == "processing":
            update_fields[f"tasks.{task_name}.started_at"] = now
        elif status in ["completed", "failed"]:
            update_fields[f"tasks.{task_name}.completed_at"] = now

        if error:
            update_fields[f"tasks.{task_name}.error"] = error

        result = self._db.submissions.update_one(
            {"submission_id": submission_id},
            {"$set": update_fields}
        )
        return result.modified_count > 0

    def update_results(
        self,
        submission_id: str,
        results: dict[str, Any]
    ) -> bool:
        """Update results fields"""
        result = self._db.submissions.update_one(
            {"submission_id": submission_id},
            {
                "$set": {
                    **{f"results.{k}": v for k, v in results.items()},
                    "updated_at": datetime.now(UTC)
                }
            }
        )
        return result.modified_count > 0

    def update_read_topics(self, submission_id: str, read_topics: List[str]) -> bool:
        """Update the list of read topic names for a submission"""
        result = self._db.submissions.update_one(
            {"submission_id": submission_id},
            {"$set": {"read_topics": read_topics, "updated_at": datetime.now(UTC)}}
        )
        return result.modified_count > 0

    def clear_results(
        self,
        submission_id: str,
        task_names: Optional[List[str]] = None
    ) -> bool:
        """Clear results and reset task statuses for refresh"""
        names = self.expand_recalculation_tasks(task_names)

        now = datetime.now(UTC)
        update_fields: dict[str, Any] = {"updated_at": now}

        # Reset task statuses
        for task_name in names:
            update_fields[f"tasks.{task_name}.status"] = "pending"
            update_fields[f"tasks.{task_name}.started_at"] = None
            update_fields[f"tasks.{task_name}.completed_at"] = None
            update_fields[f"tasks.{task_name}.error"] = None

        # Clear related results
        if "split_topic_generation" in names:
            update_fields["results.sentences"] = []
            update_fields["results.topics"] = []

        if "subtopics_generation" in names:
            update_fields["results.subtopics"] = []

        if "summarization" in names:
            update_fields["results.topic_summaries"] = {}
            update_fields["results.article_summary"] = {"text": "", "bullets": []}
            update_fields["results.summary"] = []
            update_fields["results.summary_mappings"] = []

        if "mindmap" in names:
            update_fields["results.topic_mindmaps"] = {}
            update_fields["results.mindmap_results"] = []
            update_fields["results.mindmap_metadata"] = {}

        if "prefix_tree" in names:
            update_fields["results.prefix_tree"] = {}

        result = self._db.submissions.update_one(
            {"submission_id": submission_id},
            {"$set": update_fields}
        )
        return result.modified_count > 0

    def expand_recalculation_tasks(self, task_names: Optional[List[str]] = None) -> List[str]:
        """
        Expand selected tasks with downstream dependent tasks.
        Example: requesting split_topic_generation also includes dependent tasks.
        """
        if task_names is None or "all" in task_names:
            return self.task_names.copy()

        selected = {name for name in task_names if name in self.task_names}
        expanded = set(selected)

        changed = True
        while changed:
            changed = False
            for task_name in self.task_names:
                if task_name in expanded:
                    continue
                deps = self.task_dependencies.get(task_name, [])
                if any(dep in expanded for dep in deps):
                    expanded.add(task_name)
                    changed = True

        return [name for name in self.task_names if name in expanded]

    def delete_by_id(self, submission_id: str) -> bool:
        """Delete a submission by submission_id. Returns True if deleted."""
        result = self._db.submissions.delete_one({"submission_id": submission_id})
        return result.deleted_count > 0

    def list(self, filters: Optional[dict[str, Any]] = None, limit: int = 100) -> List[dict[str, Any]]:
        """List submissions with optional filters, sorted by created_at desc."""
        return list(self._db.submissions.find(filters or {}).sort("created_at", -1).limit(limit))

    def list_with_projection(self, filters: dict[str, Any], projection: dict[str, Any]) -> List[dict[str, Any]]:
        """List submissions applying a specific projection (no default sort)."""
        return list(self._db.submissions.find(filters, projection))

    def aggregate_global_topics(self) -> List[dict[str, Any]]:
        """Return aggregated topic tree across all completed submissions."""
        pipeline = [
            {"$match": {"tasks.split_topic_generation.status": "completed"}},
            {"$unwind": "$results.topics"},
            {"$group": {
                "_id": "$results.topics.name",
                "total_sentences": {"$sum": {"$size": {"$ifNull": ["$results.topics.sentences", []]}}},
                "sources": {"$push": {
                    "submission_id": "$submission_id",
                    "source_url": "$source_url",
                    "sentence_count": {"$size": {"$ifNull": ["$results.topics.sentences", []]}}
                }}
            }},
            {"$project": {
                "_id": 0,
                "name": "$_id",
                "total_sentences": 1,
                "source_count": {"$size": "$sources"},
                "sources": 1
            }},
            {"$sort": {"name": 1}}
        ]
        return list(self._db.submissions.aggregate(pipeline))

    def get_overall_status(self, submission: dict[str, Any]) -> str:
        """Determine overall status from task statuses"""
        tasks: dict[str, Any] = submission.get("tasks", {})
        statuses = [task.get("status") for task in tasks.values()]

        if any(s == "failed" for s in statuses):
            return "failed"
        elif all(s == "completed" for s in statuses):
            return "completed"
        elif any(s == "processing" for s in statuses):
            return "processing"
        else:
            return "pending"
