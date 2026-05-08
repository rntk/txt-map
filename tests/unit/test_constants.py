"""Unit tests for lib/constants.py."""

from lib.constants import filter_known_tasks, TASK_NAMES


def test_filter_known_tasks_with_dict() -> None:
    """Returns only known tasks from a dict."""
    tasks = {
        "split_topic_generation": {"enabled": True},
        "unknown_task": {"enabled": True},
        "summarization": {"enabled": False},
    }
    result = filter_known_tasks(tasks)
    assert "split_topic_generation" in result
    assert "summarization" in result
    assert "unknown_task" not in result


def test_filter_known_tasks_with_non_dict() -> None:
    """Returns empty dict when input is not a dict."""
    assert filter_known_tasks(None) == {}
    assert filter_known_tasks([]) == {}
    assert filter_known_tasks("tasks") == {}
    assert filter_known_tasks(123) == {}


def test_filter_known_tasks_skips_non_dict_task_info() -> None:
    """Skips entries where task_info is not a dict."""
    tasks = {
        "split_topic_generation": {"enabled": True},
        "summarization": "not a dict",
    }
    result = filter_known_tasks(tasks)
    assert "split_topic_generation" in result
    assert "summarization" not in result


def test_task_names_is_list() -> None:
    """TASK_NAMES is a list of strings."""
    assert isinstance(TASK_NAMES, list)
    assert all(isinstance(t, str) for t in TASK_NAMES)
