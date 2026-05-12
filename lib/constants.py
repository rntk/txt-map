"""Shared constants for the application."""

from dataclasses import dataclass
from typing import Any, Final


@dataclass(frozen=True)
class TaskMetadata:
    """Canonical metadata for a background task type."""

    priority: int
    dependencies: tuple[str, ...] = ()
    auto_queue: bool = False
    uses_llm_cache: bool = False


TASK_METADATA: Final[dict[str, TaskMetadata]] = {
    "split_topic_generation": TaskMetadata(
        priority=1,
        auto_queue=True,
        uses_llm_cache=True,
    ),
    "subtopics_generation": TaskMetadata(
        priority=2,
        dependencies=("split_topic_generation",),
        uses_llm_cache=True,
    ),
    "summarization": TaskMetadata(
        priority=3,
        dependencies=("split_topic_generation",),
        auto_queue=True,
        uses_llm_cache=True,
    ),
    "mindmap": TaskMetadata(
        priority=3,
        dependencies=("subtopics_generation",),
    ),
    "prefix_tree": TaskMetadata(
        priority=3,
        dependencies=("split_topic_generation",),
    ),
    "insights_generation": TaskMetadata(
        priority=4,
        dependencies=("split_topic_generation",),
        uses_llm_cache=True,
    ),
    "markup_generation": TaskMetadata(
        priority=4,
        dependencies=("split_topic_generation",),
        uses_llm_cache=True,
    ),
    "topic_marker_summary_generation": TaskMetadata(
        priority=4,
        dependencies=("split_topic_generation",),
        uses_llm_cache=True,
    ),
    "topic_temperature_generation": TaskMetadata(
        priority=4,
        dependencies=("split_topic_generation",),
        uses_llm_cache=True,
    ),
    "topic_tag_ranking_generation": TaskMetadata(
        priority=4,
        dependencies=("split_topic_generation",),
        uses_llm_cache=True,
    ),
    "clustering_generation": TaskMetadata(
        priority=4,
        dependencies=("split_topic_generation",),
    ),
    "topic_modeling_generation": TaskMetadata(
        priority=4,
        dependencies=("split_topic_generation",),
    ),
}

TASK_NAMES: Final[list[str]] = list(TASK_METADATA)

# Tasks queued automatically when a submission is created or refreshed with "all".
# Every other task in TASK_NAMES is manual-only and must be requested by name.
AUTO_TASKS: Final[list[str]] = [
    task_name for task_name, metadata in TASK_METADATA.items() if metadata.auto_queue
]

# Task types allowed for queue operations.
ALLOWED_TASKS: Final[list[str]] = list(TASK_METADATA)

# Priority values for task types (lower = higher priority).
TASK_PRIORITIES: Final[dict[str, int]] = {
    task_name: metadata.priority for task_name, metadata in TASK_METADATA.items()
}

# Task dependencies - tasks can only run if their dependencies are completed.
TASK_DEPENDENCIES: Final[dict[str, list[str]]] = {
    task_name: list(metadata.dependencies)
    for task_name, metadata in TASK_METADATA.items()
}

TASKS_USING_LLM_CACHE: Final[frozenset[str]] = frozenset(
    task_name
    for task_name, metadata in TASK_METADATA.items()
    if metadata.uses_llm_cache
)


def filter_known_tasks(tasks: Any) -> dict[str, dict[str, Any]]:
    """Return only canonical task entries from an arbitrary task map."""
    if not isinstance(tasks, dict):
        return {}

    return {
        task_name: task_info
        for task_name, task_info in tasks.items()
        if task_name in TASK_NAMES and isinstance(task_info, dict)
    }
