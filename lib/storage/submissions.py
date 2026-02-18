import logging
import uuid
from typing import Optional, List
from datetime import datetime, UTC

from pymongo import MongoClient


class SubmissionsStorage:
    indexes = ["submission_id", "created_at"]
    task_names = ["split_topic_generation", "subtopics_generation", "summarization", "mindmap", "insides", "prefix_tree"]
    task_dependencies = {
        "split_topic_generation": [],
        "subtopics_generation": ["split_topic_generation"],
        "summarization": ["split_topic_generation"],
        "mindmap": ["split_topic_generation"],
        "insides": ["split_topic_generation"],
        "prefix_tree": ["split_topic_generation"],
    }

    def __init__(self, db: MongoClient) -> None:
        self._db: MongoClient = db
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
    ) -> dict:
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
                "insides": {
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
            "results": {
                "sentences": [],
                "topics": [],
                "topic_summaries": {},
                "topic_mindmaps": {},
                "mindmap_results": [],
                "subtopics": [],
                "summary": [],
                "summary_mappings": [],
                "insides": [],
                "prefix_tree": {}
            }
        }

        self._db.submissions.insert_one(submission)
        return submission

    def get_by_id(self, submission_id: str) -> Optional[dict]:
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
        update_fields = {
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
        results: dict
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

    def clear_results(
        self,
        submission_id: str,
        task_names: Optional[List[str]] = None
    ) -> bool:
        """Clear results and reset task statuses for refresh"""
        task_names = self.expand_recalculation_tasks(task_names)

        now = datetime.now(UTC)
        update_fields = {"updated_at": now}

        # Reset task statuses
        for task_name in task_names:
            update_fields[f"tasks.{task_name}.status"] = "pending"
            update_fields[f"tasks.{task_name}.started_at"] = None
            update_fields[f"tasks.{task_name}.completed_at"] = None
            update_fields[f"tasks.{task_name}.error"] = None

        # Clear related results
        if "split_topic_generation" in task_names:
            update_fields["results.sentences"] = []
            update_fields["results.topics"] = []

        if "subtopics_generation" in task_names:
            update_fields["results.subtopics"] = []

        if "summarization" in task_names:
            update_fields["results.topic_summaries"] = {}
            update_fields["results.summary"] = []
            update_fields["results.summary_mappings"] = []

        if "mindmap" in task_names:
            update_fields["results.topic_mindmaps"] = {}
            update_fields["results.mindmap_results"] = []
            update_fields["results.mindmap_metadata"] = {}

        if "insides" in task_names:
            update_fields["results.insides"] = []

        if "prefix_tree" in task_names:
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

    def get_overall_status(self, submission: dict) -> str:
        """Determine overall status from task statuses"""
        tasks = submission.get("tasks", {})
        statuses = [task.get("status") for task in tasks.values()]

        if any(s == "failed" for s in statuses):
            return "failed"
        elif all(s == "completed" for s in statuses):
            return "completed"
        elif any(s == "processing" for s in statuses):
            return "processing"
        else:
            return "pending"
