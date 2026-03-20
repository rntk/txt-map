"""Shared constants for the application."""
from typing import List, Dict

# Task types allowed for queue operations
ALLOWED_TASKS: List[str] = [
    "split_topic_generation",
    "subtopics_generation",
    "summarization",
    "mindmap",
    "prefix_tree",
]

# Priority values for task types (lower = higher priority)
TASK_PRIORITIES: Dict[str, int] = {
    "split_topic_generation": 1,
    "subtopics_generation": 2,
    "summarization": 3,
    "mindmap": 3,
    "prefix_tree": 3,
}
