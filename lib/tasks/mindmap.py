"""
Mindmap generation task - creates mindmap structures for topics
"""
from lib.storage.submissions import SubmissionsStorage
import hashlib
import datetime


def mark_words_in_sentence(sentence: str):
    """Mark each word with an index marker"""
    words = sentence.split()
    marked_parts = []
    for i, word in enumerate(words):
        marked_parts.append(f"{word} |#{i}#|")
    return " ".join(marked_parts), words


def generate_mindmap_for_topic(topic_name, sentences, sentence_indices, llm, cache_collection):
    """
    Generate a mind map structure for a specific topic based on its sentences.
    """
    if not sentences:
        return {}, []

    # Combine sentences for the topic and track sentence boundaries in the combined text
    combined_text = ""
    sentence_boundaries = []  # List of (start_word_idx, end_word_idx) for each sentence
    current_word_idx = 0

    for sent in sentences:
        sent_words = sent.split()
        num_words = len(sent_words)
        sentence_boundaries.append((current_word_idx, current_word_idx + num_words - 1))
        if combined_text:
            combined_text += " " + sent
        else:
            combined_text = sent
        current_word_idx += num_words

    marked_text, sentence_words = mark_words_in_sentence(combined_text)

    prompt_template = """You are given a text where every word is followed by a numbered marker |#N#|.
Your task is to extract a mind map structure from this text by identifying the word ranges that represent topics and subtopics.

CRITICAL INSTRUCTIONS FOR BREVITY AND MEANINGFUL EXTRACTION:
- EXTRACT ONLY THE MOST MEANINGFUL KEY TERMS: Focus on the core concepts that define each topic.
- PRIORITIZE BREVITY ABOVE ALL ELSE: Node titles must be as short as possible while retaining meaning.
- IDEAL LENGTH: 1-3 words maximum. Never exceed 4 words unless absolutely necessary for clarity.
- FOCUS ON ESSENTIAL WORDS: Extract only nouns, verbs, and critical modifiers. Eliminate all filler words.
- AVOID REDUNDANCY: Don't repeat words across hierarchy levels. Each level should add new information.
- SELECT THE MOST SPECIFIC TERMS: Choose the most precise and informative words from the text.
- PREFER SINGLE WORD NOUNS: If a concept can be represented by a single noun, use that.
- ELIMINATE CONNECTING WORDS: Remove articles (the, a, an), conjunctions (and, but), prepositions (in, on), etc.
- AVOID ADJECTIVES UNLESS CRITICAL: Only include adjectives if they fundamentally change the meaning.

EXAMPLE OF GOOD EXTRACTION:
Original text: "The |#0#| rapid |#1#| development |#2#| of |#3#| artificial |#4#| intelligence |#5#| technologies |#6#| in |#7#| modern |#8#| healthcare |#9#| systems |#10#|"
Good extraction: "development, intelligence" or "AI, healthcare"
Bad extraction: "rapid development of artificial intelligence technologies in modern healthcare systems"

Return a hierarchical list of word ranges in the format:
Topic_Range, Subtopic_Range

Format for a range is: start-end
Where 'start' is the marker number of the first word and 'end' is the marker number of the last word (inclusive).

Example:
Text: The |#0#| quick |#1#| brown |#2#| fox |#3#| jumps |#4#| over |#5#| the |#6#| lazy |#7#| dog |#8#|
Mind map:
3-3, 8-8  # "fox", "dog" - shortest meaningful terms

<content>
{marked_text}
</content>

Mind map:"""

    prompt = prompt_template.replace("{marked_text}", marked_text)
    prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

    cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})

    if cached_response:
        mindmap_response = cached_response["response"]
    else:
        mindmap_response = llm.call([prompt])
        cache_collection.update_one(
            {"prompt_hash": prompt_hash},
            {"$set": {
                "prompt_hash": prompt_hash,
                "prompt": prompt,
                "response": mindmap_response,
                "created_at": datetime.datetime.now()
            }},
            upsert=True
        )

    # Parse the mindmap response - expect comma-separated ranges
    mindmap_topics = []
    sentence_to_hierarchies = {}

    for line in mindmap_response.strip().split('\n'):
        line = line.strip()
        if not line:
            continue

        # Split by comma to get hierarchy
        parts = [p.strip() for p in line.split(',')]
        if not parts:
            continue

        current_hierarchy = [topic_name]  # Root of the mindmap is the topic name
        valid_line = True
        line_ranges = []

        for i, part in enumerate(parts):
            # Parse range start-end
            if '-' in part:
                # Remove any non-digit/dash chars
                clean_part = "".join(c for c in part if c.isdigit() or c == '-')
                range_parts = clean_part.split('-')

                if len(range_parts) == 2 and range_parts[0] and range_parts[1]:
                    try:
                        r_start = int(range_parts[0])
                        r_end = int(range_parts[1])

                        # Validate indices
                        if 0 <= r_start <= r_end < len(sentence_words):
                            # Extract text
                            topic_text = " ".join(sentence_words[r_start:r_end + 1])

                            # Avoid duplicating the parent topic name
                            if topic_text.lower() == (current_hierarchy[-1].lower() if current_hierarchy else ""):
                                continue

                            current_hierarchy.append(topic_text)
                            line_ranges.append((r_start, r_end))
                        else:
                            valid_line = False
                            break
                    except ValueError:
                        valid_line = False
                        break
                else:
                    valid_line = False
                    break
            else:
                valid_line = False
                break

        if valid_line and current_hierarchy:
            mindmap_topics.append(current_hierarchy)
            # Find which sentences this hierarchy belongs to
            for r_start, r_end in line_ranges:
                for i, (s_start, s_end) in enumerate(sentence_boundaries):
                    # Check for overlap
                    if max(r_start, s_start) <= min(r_end, s_end):
                        orig_idx = sentence_indices[i]
                        if orig_idx not in sentence_to_hierarchies:
                            sentence_to_hierarchies[orig_idx] = []
                        if current_hierarchy not in sentence_to_hierarchies[orig_idx]:
                            sentence_to_hierarchies[orig_idx].append(current_hierarchy)

    # Build the hierarchical structure under topic_name
    structure = {}
    for topic_hierarchy in mindmap_topics:
        current_level = structure
        # Skip the first level (topic_name) because it's already the key
        for topic in topic_hierarchy[1:]:
            if topic not in current_level:
                current_level[topic] = {}
            current_level = current_level[topic]

    # Build mindmap_results format for this topic
    mindmap_results = []
    for i, orig_idx in enumerate(sentence_indices):
        hierarchies = sentence_to_hierarchies.get(orig_idx, [[topic_name]])
        mindmap_results.append({
            "sentence_index": orig_idx,
            "sentence": sentences[i],
            "mindmap_topics": hierarchies
        })

    return structure, mindmap_results


def process_mindmap(submission: dict, db, llm):
    """
    Process mindmap generation task for a submission.

    Args:
        submission: Submission document from DB
        db: MongoDB database instance
        llm: LLamaCPP client instance
    """
    submission_id = submission["submission_id"]
    results = submission.get("results", {})

    sentences = results.get("sentences", [])
    topics = results.get("topics", [])

    if not topics or not sentences:
        raise ValueError("Topic extraction must be completed first")

    # Ensure LLM cache collection exists
    cache_collection = db.llm_cache
    if "llm_cache" not in db.list_collection_names():
        db.create_collection("llm_cache")
        try:
            db.llm_cache.create_index("prompt_hash", unique=True)
        except:
            pass

    topic_mindmaps = {}
    all_mindmap_results = []

    print(f"Generating mindmaps for {len(topics)} topics")

    for topic in topics:
        if topic["sentences"] and topic["name"] != "no_topic":
            topic_sentences_text = [
                sentences[idx - 1] for idx in topic["sentences"]
                if 0 <= idx - 1 < len(sentences)
            ]

            if topic_sentences_text:
                structure, results = generate_mindmap_for_topic(
                    topic["name"],
                    topic_sentences_text,
                    topic["sentences"],
                    llm,
                    cache_collection
                )
                topic_mindmaps[topic["name"]] = structure
                all_mindmap_results.extend(results)

    # Update submission with results
    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(
        submission_id,
        {
            "topic_mindmaps": topic_mindmaps,
            "mindmap_results": all_mindmap_results
        }
    )

    print(f"Mindmap generation completed for submission {submission_id}: {len(topic_mindmaps)} topic mindmaps")
