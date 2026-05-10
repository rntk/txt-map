"""Shared constants for the application."""

from typing import Any, Dict, List


TASK_NAMES: List[str] = [
    "split_topic_generation",
    "subtopics_generation",
    "summarization",
    "mindmap",
    "prefix_tree",
    "insights_generation",
    "markup_generation",
    "topic_marker_summary_generation",
    "topic_temperature_generation",
    "clustering_generation",
    "topic_modeling_generation",
]

# Tasks queued automatically when a submission is created or refreshed with "all".
# Every other task in TASK_NAMES is manual-only and must be requested by name.
AUTO_TASKS: List[str] = [
    "split_topic_generation",
    "summarization",
]

# Task types allowed for queue operations.
ALLOWED_TASKS: List[str] = TASK_NAMES.copy()

# Priority values for task types (lower = higher priority)
TASK_PRIORITIES: Dict[str, int] = {
    "split_topic_generation": 1,
    "subtopics_generation": 2,
    "summarization": 3,
    "mindmap": 3,
    "prefix_tree": 3,
    "insights_generation": 4,
    "markup_generation": 4,
    "topic_marker_summary_generation": 4,
    "topic_temperature_generation": 4,
    "clustering_generation": 4,
    "topic_modeling_generation": 4,
}


def filter_known_tasks(tasks: Any) -> Dict[str, Dict[str, Any]]:
    """Return only canonical task entries from an arbitrary task map."""
    if not isinstance(tasks, dict):
        return {}

    return {
        task_name: task_info
        for task_name, task_info in tasks.items()
        if task_name in TASK_NAMES and isinstance(task_info, dict)
    }
