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
    print(f"\n=== DEBUG: Summarization (per-group) - max_text_tokens: {max_text_tokens}, total groups: {len(sent_list)} ===")

    all_summary_sentences = []
    summary_mappings = []

    for idx, s in enumerate(sent_list):
        # If a single group is too large, we still try to summarize it directly and rely on the model's ability
        # to handle long inputs up to max_text_tokens. For extremely long texts, the model/server may truncate.
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
