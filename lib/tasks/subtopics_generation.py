"""
Subtopics generation task - generates subtopics for existing topics.
"""
from lib.storage.submissions import SubmissionsStorage
import datetime
import hashlib
import re


def generate_subtopics_for_topic(topic_name, sentences, sentence_indices, llm, cache_collection):
    """
    Generate subtopics for a specific topic.
    """
    if not sentences or topic_name == "no_topic":
        return []

    numbered_sentences = [
        f"{sentence_indices[i]}. {sentences[i]}" for i in range(len(sentences))
    ]
    sentences_text = "\n".join(numbered_sentences)

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
    prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

    cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})

    if cached_response:
        response = cached_response["response"]
    else:
        response = llm.call([prompt])
        cache_collection.update_one(
            {"prompt_hash": prompt_hash},
            {
                "$set": {
                    "prompt_hash": prompt_hash,
                    "prompt": prompt,
                    "response": response,
                    "created_at": datetime.datetime.now(),
                }
            },
            upsert=True,
        )

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


def process_subtopics_generation(submission: dict, db, llm):
    """
    Process subtopics generation for a submission.

    Args:
        submission: Submission document from DB.
        db: MongoDB database instance.
        llm: LLamaCPP client instance.
    """
    submission_id = submission["submission_id"]
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

    cache_collection = db.llm_cache
    if "llm_cache" not in db.list_collection_names():
        db.create_collection("llm_cache")
        try:
            db.llm_cache.create_index("prompt_hash", unique=True)
        except Exception:
            pass

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
            llm,
            cache_collection,
        )
        all_subtopics.extend(subtopics)

    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(submission_id, {"subtopics": all_subtopics})

    print(
        f"Subtopics generation completed for submission {submission_id}: "
        f"{len(all_subtopics)} subtopics"
    )
