import logging
import uuid
from typing import Optional, List
from datetime import datetime

from pymongo import MongoClient


class SubmissionsStorage:
    indexes = ["submission_id", "created_at"]

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
        now = datetime.utcnow()

        submission = {
            "submission_id": submission_id,
            "html_content": html_content,
            "text_content": text_content,
            "source_url": source_url,
            "created_at": now,
            "updated_at": now,
            "tasks": {
                "text_splitting": {
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "error": None
                },
                "topic_extraction": {
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
                }
            },
            "results": {
                "sentences": [],
                "words": [],
                "marked_text": "",
                "marker_count": 0,
                "marker_word_indices": [],
                "word_to_paragraph": [],
                "paragraph_texts": [],
                "topics": [],
                "topic_summaries": {},
                "topic_mindmaps": {},
                "mindmap_results": [],
                "subtopics": [],
                "summary": [],
                "summary_mappings": [],
                "insides": []
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
        now = datetime.utcnow()
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
                    "updated_at": datetime.utcnow()
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
        if task_names is None:
            task_names = ["text_splitting", "topic_extraction", "summarization", "mindmap", "insides"]

        now = datetime.utcnow()
        update_fields = {"updated_at": now}

        # Reset task statuses
        for task_name in task_names:
            update_fields[f"tasks.{task_name}.status"] = "pending"
            update_fields[f"tasks.{task_name}.started_at"] = None
            update_fields[f"tasks.{task_name}.completed_at"] = None
            update_fields[f"tasks.{task_name}.error"] = None

        # Clear related results
        if "text_splitting" in task_names:
            update_fields["results.sentences"] = []
            update_fields["results.words"] = []
            update_fields["results.marked_text"] = ""
            update_fields["results.marker_count"] = 0
            update_fields["results.marker_word_indices"] = []
            update_fields["results.word_to_paragraph"] = []
            update_fields["results.paragraph_texts"] = []

        if "topic_extraction" in task_names:
            update_fields["results.topics"] = []
            update_fields["results.subtopics"] = []

        if "summarization" in task_names:
            update_fields["results.topic_summaries"] = {}
            update_fields["results.summary"] = []
            update_fields["results.summary_mappings"] = []

        if "mindmap" in task_names:
            update_fields["results.topic_mindmaps"] = {}
            update_fields["results.mindmap_results"] = []

        if "insides" in task_names:
            update_fields["results.insides"] = []

        result = self._db.submissions.update_one(
            {"submission_id": submission_id},
            {"$set": update_fields}
        )
        return result.modified_count > 0

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
