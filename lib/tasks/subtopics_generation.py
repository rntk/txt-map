"""
Subtopics generation task - generates subtopics for existing topics.
"""
import re
from typing import Any

from lib.storage.submissions import SubmissionsStorage
from txt_splitt.cache import CachingLLMCallable


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


def generate_subtopics_for_topic(
    topic_name: str,
    sentences: list[str],
    sentence_indices: list[int],
    cached_llm: Any,
) -> list[dict[str, Any]]:
    """
    Generate subtopics for a specific topic.

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

    numbered_sentences: list[str] = [
        f"{sentence_indices[i]}. {sentences[i]}" for i in range(len(sentences))
    ]
    sentences_text: str = "\n".join(numbered_sentences)

    prompt_template = """Group the following sentences into detailed sub-chapters for the topic "{topic_name}".
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

    prompt = (
        prompt_template.replace("{topic_name}", topic_name)
        .replace("{sentences_text}", sentences_text)
    )

    response = cached_llm.call(prompt, 0.0)

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
        llm: LLamaCPP client instance.
        cache_store: Optional MongoLLMCacheStore instance.
    """
    submission_id: str = submission["submission_id"]
    results = submission.get("results", {})

    sentences = results.get("sentences", [])
    topics = results.get("topics", [])

    if not sentences:
        raise ValueError("Split/topic generation must be completed first")

    if not topics:
        # No topics means no subtopics, but the task is still considered complete.
        SubmissionsStorage(db).update_results(submission_id, {"subtopics": []})
        print(f"Subtopics generation completed for submission {submission_id}: 0 subtopics")
        return

    llm_adapter = _LLMAdapter(llm)
    if cache_store is not None:
        cached_llm = CachingLLMCallable(
            llm_adapter,
            cache_store,
            namespace=_cache_namespace("subtopics", llm),
        )
    else:
        cached_llm = llm_adapter

    all_subtopics = []

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
