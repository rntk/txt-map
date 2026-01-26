"""
Summarization task - generates summaries for sentences and topics
"""
from lib.storage.submissions import SubmissionsStorage
import hashlib
import datetime


def summarize_by_sentence_groups(sent_list, llm_client, cache_collection, max_groups_tokens_buffer=400):
    """
    Create one summary per sentence-group (i.e., per entry in sent_list), so the number of
    summaries equals the number of sentence groups. Each summary gets a mapping to its single
    source sentence index. This aligns the UI with expectations: N groups -> N summaries.
    """
    prompt_template = (
        "Summarize the text within the <text> tags into a super brief summary (just a few words).\n"
        "- Keep it objective and extremely concise.\n\n"
        "Text:\n<text>{sentence}</text>\n\nSummary:"
    )

    template_tokens = llm_client.estimate_tokens(prompt_template.replace("{sentence}", ""))
    max_text_tokens = llm_client._LLamaCPP__max_context_tokens - template_tokens - max_groups_tokens_buffer

    all_summary_sentences = []
    summary_mappings = []

    for idx, s in enumerate(sent_list):
        sentences_text = s
        prompt = prompt_template.replace("{sentence}", sentences_text)
        prompt_hash = hashlib.md5(prompt.encode()).hexdigest()
        cached = cache_collection.find_one({"prompt_hash": prompt_hash})
        if cached:
            resp = cached["response"]
        else:
            resp = llm_client.call([prompt])
            cache_collection.update_one(
                {"prompt_hash": prompt_hash},
                {"$set": {
                    "prompt_hash": prompt_hash,
                    "prompt": prompt,
                    "response": resp,
                    "created_at": datetime.datetime.now()
                }},
                upsert=True
            )

        summary_text = resp.strip()
        if summary_text:
            summary_idx = len(all_summary_sentences)
            all_summary_sentences.append(summary_text)
            summary_mappings.append({
                "summary_index": summary_idx,
                "summary_sentence": summary_text,
                "source_sentences": [idx + 1]  # 1-indexed mapping to the group sentence
            })

    return all_summary_sentences, summary_mappings


def process_summarization(submission: dict, db, llm):
    """
    Process summarization task for a submission.
    Generates both overall summaries and topic-specific summaries.

    Args:
        submission: Submission document from DB
        db: MongoDB database instance
        llm: LLamaCPP client instance
    """
    submission_id = submission["submission_id"]
    results = submission.get("results", {})

    sentences = results.get("sentences", [])
    topics = results.get("topics", [])

    if not sentences:
        raise ValueError("Text splitting must be completed first")

    # Ensure LLM cache collection exists
    cache_collection = db.llm_cache
    if "llm_cache" not in db.list_collection_names():
        db.create_collection("llm_cache")
        try:
            db.llm_cache.create_index("prompt_hash", unique=True)
        except:
            pass

    # Generate overall summary for all sentences
    print(f"Generating overall summary for {len(sentences)} sentences")
    summary_sentences, summary_mappings = summarize_by_sentence_groups(
        sentences, llm, cache_collection
    )

    # Generate summaries for each topic
    topic_summaries = {}
    if topics:
        print(f"Generating summaries for {len(topics)} topics")
        for topic in topics:
            if topic["sentences"] and topic["name"] != "no_topic":
                # Get the sentences for this topic
                topic_sentences_text = [
                    sentences[idx - 1] for idx in topic["sentences"]
                    if 0 <= idx - 1 < len(sentences)
                ]

                if topic_sentences_text:
                    # Summarize topic sentences
                    ts_summary, _ = summarize_by_sentence_groups(
                        topic_sentences_text, llm, cache_collection
                    )
                    topic_summaries[topic["name"]] = " ".join(ts_summary)

    # Update submission with results
    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(
        submission_id,
        {
            "summary": summary_sentences,
            "summary_mappings": summary_mappings,
            "topic_summaries": topic_summaries
        }
    )

    print(f"Summarization completed for submission {submission_id}: {len(summary_sentences)} summaries, {len(topic_summaries)} topic summaries")
