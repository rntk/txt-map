"""
Subtopics generation task - generates subtopics for existing topics.
"""
import logging
import re
from typing import Any

from lib.llm_queue.client import QueuedLLMClient
from lib.storage.submissions import SubmissionsStorage
from txt_splitt import RetryingLLMCallable
from txt_splitt.cache import CachingLLMCallable

logger = logging.getLogger(__name__)


class _LLMAdapter:
    """Adapter for LLamaCPP to txt_splitt LLMCallable protocol."""

    def __init__(self, client: Any) -> None:
        self._client: Any = client

    @property
    def model_id(self) -> str | None:
        return getattr(self._client, "model_id", None)

    def call(self, prompt: str, temperature: float = 0.0) -> str:
        return self._client.call([prompt], temperature=temperature)


def _cache_namespace(base_namespace: str, llm_client: Any) -> str:
    model_id: str = getattr(llm_client, "model_id", "unknown")
    return f"{base_namespace}:{model_id}"


_PROMPT_TEMPLATE = """Group the following sentences into detailed sub-chapters for the topic "{topic_name}".
- For each sub-chapter, specify which sentences belong to it.
- Output format MUST be exactly:
<subtopic_name>: <comma-separated sentence numbers>

Important instructions:
- Use the exact sentence numbers as provided (e.g., if "15. Some text", use 15).
- Keep sub-chapters specific and meaningful.
- Aim for 2-5 subtopics per chapter.
- If a sentence doesn't fit, assign it to 'no_topic'.

Topic: {topic_name}
Sentences:
{sentences_text}"""


def _build_subtopic_prompt(
    topic_name: str,
    sentences: list[str],
    sentence_indices: list[int],
) -> str:
    """Build the LLM prompt for a single topic's subtopic generation."""
    numbered_sentences: list[str] = [
        f"{sentence_indices[i]}. {sentences[i]}" for i in range(len(sentences))
    ]
    sentences_text: str = "\n".join(numbered_sentences)
    return _PROMPT_TEMPLATE.format(
        topic_name=topic_name,
        sentences_text=sentences_text,
    )


def _parse_subtopic_response(
    response: str,
    topic_name: str,
) -> list[dict[str, Any]]:
    """Parse the LLM response for a single topic into subtopic dicts."""
    subtopics = []
    for line in response.strip().split("\n"):
        if ":" not in line:
            continue
        name, nums_str = line.split(":", 1)
        name = name.strip()
        clean_name = re.sub(r"[^a-zA-Z0-9 ]+", " ", name).strip()
        nums = [int(n.strip()) for n in nums_str.split(",") if n.strip().isdigit()]
        if nums:
            subtopics.append(
                {
                    "name": clean_name,
                    "sentences": nums,
                    "parent_topic": topic_name,
                }
            )
    return subtopics


def generate_subtopics_for_topic(
    topic_name: str,
    sentences: list[str],
    sentence_indices: list[int],
    cached_llm: Any,
) -> list[dict[str, Any]]:
    """
    Generate subtopics for a specific topic (sequential, legacy API).

    Args:
        topic_name: Name of the topic.
        sentences: List of sentence texts.
        sentence_indices: List of sentence indices.
        cached_llm: An LLMCallable (possibly wrapped with CachingLLMCallable).

    Returns:
        List of subtopic dictionaries.
    """
    if not sentences or topic_name == "no_topic":
        return []
    prompt = _build_subtopic_prompt(topic_name, sentences, sentence_indices)
    response = cached_llm.call(prompt, 0.5)
    return _parse_subtopic_response(response, topic_name)


def process_subtopics_generation(
    submission: dict[str, Any],
    db: Any,
    llm: Any,
    cache_store: Any | None = None,
) -> None:
    """
    Process subtopics generation for a submission.

    Args:
        submission: Submission document from DB.
        db: MongoDB database instance.
        llm: LLM client instance (QueuedLLMClient or legacy LLMClient).
        cache_store: Optional MongoLLMCacheStore instance.
    """
    submission_id: str = submission["submission_id"]
    results = submission.get("results", {})

    sentences = results.get("sentences", [])
    topics = results.get("topics", [])

    if not sentences:
        raise ValueError("Split/topic generation must be completed first")

    if not topics:
        SubmissionsStorage(db).update_results(submission_id, {"subtopics": []})
        print(f"Subtopics generation completed for submission {submission_id}: 0 subtopics")
        return

    # Collect valid topics with their data up-front.
    valid_topics: list[tuple[str, list[str], list[int]]] = []
    for topic in topics:
        topic_name = topic.get("name")
        topic_sentence_indices = topic.get("sentences", [])
        if not topic_name or not topic_sentence_indices or topic_name == "no_topic":
            continue
        topic_sentences = [
            sentences[idx - 1]
            for idx in topic_sentence_indices
            if 0 <= idx - 1 < len(sentences)
        ]
        if topic_sentences:
            valid_topics.append((topic_name, topic_sentences, topic_sentence_indices))

    all_subtopics: list[dict[str, Any]] = []

    if isinstance(llm, QueuedLLMClient):
        # ── Parallel path (QueuedLLMClient) ──────────────────────────────────
        # Submit all topic prompts to the queue concurrently, then gather.
        # Network retries are handled by the LLM worker; business-logic retries
        # (malformed responses) are not retried here — callers can re-queue the task.
        # Note: subtopics use temperature=0.5, so cache is bypassed by design.
        futures_and_topics: list[tuple[Any, str]] = []
        for topic_name, topic_sentences, topic_sentence_indices in valid_topics:
            prompt = _build_subtopic_prompt(topic_name, topic_sentences, topic_sentence_indices)
            future = llm.submit(prompt, 0.5)
            futures_and_topics.append((future, topic_name))

        logger.info(
            "[%s] subtopics_generation: submitted %d topics in parallel",
            submission_id, len(futures_and_topics),
        )

        for future, topic_name in futures_and_topics:
            response = future.result()
            subtopics = _parse_subtopic_response(response, topic_name)
            all_subtopics.extend(subtopics)
    else:
        # ── Sequential path (legacy LLMClient or test mocks) ─────────────────
        llm_adapter = _LLMAdapter(llm)
        llm_with_retry = RetryingLLMCallable(llm_adapter, max_retries=3, backoff_factor=1.0)
        if cache_store is not None:
            cached_llm = CachingLLMCallable(
                llm_with_retry,
                cache_store,
                namespace=_cache_namespace("subtopics", llm),
            )
        else:
            cached_llm = llm_with_retry

        for topic_name, topic_sentences, topic_sentence_indices in valid_topics:
            subtopics = generate_subtopics_for_topic(
                topic_name,
                topic_sentences,
                topic_sentence_indices,
                cached_llm,
            )
            all_subtopics.extend(subtopics)

    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(submission_id, {"subtopics": all_subtopics})

    print(
        f"Subtopics generation completed for submission {submission_id}: "
        f"{len(all_subtopics)} subtopics"
    )
