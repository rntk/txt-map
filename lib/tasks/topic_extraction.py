"""
Topic extraction task - extracts topics from text using coordinate grid approach
"""
from lib.storage.submissions import SubmissionsStorage
import hashlib
import datetime
import re


def normalize_topic(topic_name):
    """
    Normalize topic name to avoid duplicates due to case, spaces vs underscores, etc.
    """
    return re.sub(r'[^a-z0-9]+', '_', topic_name.lower()).strip('_')


def generate_subtopics_for_topic(topic_name, sentences, sentence_indices, llm, cache_collection):
    """
    Generate subtopics for a specific chapter/topic.
    
    Args:
        topic_name: Name of the parent topic
        sentences: List of sentence texts for this topic
        sentence_indices: List of sentence indices (1-based) in the original document
        llm: LLamaCPP client instance
        cache_collection: MongoDB cache collection
        
    Returns:
        List of subtopic dictionaries with name, sentences, and parent_topic
    """
    if not sentences or topic_name == "no_topic":
        return []

    numbered_sentences = [f"{sentence_indices[i]}. {sentences[i]}" for i in range(len(sentences))]
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

    prompt = prompt_template.replace("{topic_name}", topic_name).replace("{sentences_text}", sentences_text)
    prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

    cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})

    if cached_response:
        response = cached_response["response"]
    else:
        response = llm.call([prompt])
        cache_collection.update_one(
            {"prompt_hash": prompt_hash},
            {"$set": {
                "prompt_hash": prompt_hash,
                "prompt": prompt,
                "response": response,
                "created_at": datetime.datetime.now()
            }},
            upsert=True
        )

    subtopics = []
    for line in response.strip().split('\n'):
        if ':' in line:
            name, nums_str = line.split(':', 1)
            name = name.strip()
            # Normalize subtopic name but keep it descriptive
            clean_name = re.sub(r'[^a-zA-Z0-9 ]+', ' ', name).strip()
            nums = [int(n.strip()) for n in nums_str.split(',') if n.strip().isdigit()]
            if nums:
                subtopics.append({
                    "name": clean_name,
                    "sentences": nums,
                    "parent_topic": topic_name
                })
    
    return subtopics


def create_coordinate_grid(sentences):
    """
    Split sentences into a grid of words (Lines x Words).
    Returns:
        grid: List of List of words.
        rows: List of original sentence strings (lines).
    """
    grid = []
    for sentence in sentences:
        words = sentence.split()
        grid.append(words)

    return grid, sentences


def process_topic_extraction(submission: dict, db, llm):
    """
    Process topic extraction task using coordinate grid approach.

    Args:
        submission: Submission document from DB
        db: MongoDB database instance
        llm: LLamaCPP client instance
    """
    submission_id = submission["submission_id"]
    results = submission.get("results", {})

    sentences = results.get("sentences", [])

    if not sentences:
        raise ValueError("Text splitting must be completed first")

    # Create coordinate grid
    grid, rows = create_coordinate_grid(sentences)

    if not grid:
        print(f"No grid created for submission {submission_id}")
        submissions_storage = SubmissionsStorage(db)
        submissions_storage.update_results(submission_id, {"topics": []})
        return

    # Ensure LLM cache collection exists
    cache_collection = db.llm_cache
    if "llm_cache" not in db.list_collection_names():
        db.create_collection("llm_cache")
        try:
            db.llm_cache.create_index("prompt_hash", unique=True)
        except:
            pass  # Index might already exist

    # Prompt Template for grid-based topic extraction
    prompt_template = """You are analyzing a text presented as a coordinate grid (Excel-like).
X axis: Word position (0-indexed)
Y axis: Line/Sentence number (0-indexed)
The X-axis header at the top shows column numbers.

Your task is to:
1. Identify logical topics or themes in the text.
2. Define the sentences/segments that belong to each topic using Start and End coordinates.
   - Start coordinate: (Y, X)
   - End coordinate: (Y, X)

Output format (exactly one topic per line):
Topic name: (StartY, StartX)-(EndY, EndX), (StartY, StartX)-(EndY, EndX)

Example:
Artificial Intelligence: (0,0)-(0,15), (1,0)-(1,10)
Machine Learning: (2,0)-(2,8)
no_topic: (2,9)-(2,15)

Instructions:
- Coordinate format: (LineNumber, WordNumber). e.g., (0, 0) is the first word of the first line.
- Covers ALL text: Every word in the grid must belong to a topic or 'no_topic'.
- Ranges are INCLUSIVE.
- If a sentence (Row) is split between topics, use precise word coordinates.
- Reading order is: Row Y, Word X -> Row Y, Word X+1 ... -> Row Y+1, Word 0 ...

<grid>
{grid_text}
</grid>

Result:"""

    # Build grid text for prompt
    grid_lines = []
    for i, words in enumerate(grid):
        line_str = f"{i}: " + " ".join(words)
        grid_lines.append(line_str)

    # Chunk if needed
    chunks = []
    chunk_line_ranges = []

    max_tokens = llm._LLamaCPP__max_context_tokens - 1000

    current_chunk_lines_str = []
    current_chunk_words = []
    current_chunk_len = 0
    chunk_start_y = 0

    for i, words in enumerate(grid):
        line_str = grid_lines[i]
        line_len = len(line_str)

        if current_chunk_len + line_len > max_tokens * 3:
            if llm.estimate_tokens("\n".join(current_chunk_lines_str) + line_str) > max_tokens:
                # Finalize current chunk
                max_w = max(len(w_list) for w_list in current_chunk_words) if current_chunk_words else 0
                header = "X: " + " ".join([str(x) for x in range(max_w)])
                full_chunk_str = header + "\n" + "\n".join(current_chunk_lines_str)

                chunks.append(full_chunk_str)
                chunk_line_ranges.append((chunk_start_y, i))

                current_chunk_lines_str = [line_str]
                current_chunk_words = [words]
                current_chunk_len = line_len
                chunk_start_y = i
                continue

        current_chunk_lines_str.append(line_str)
        current_chunk_words.append(words)
        current_chunk_len += line_len

    if current_chunk_lines_str:
        max_w = max(len(w_list) for w_list in current_chunk_words) if current_chunk_words else 0
        header = "X: " + " ".join([str(x) for x in range(max_w)])
        full_chunk_str = header + "\n" + "\n".join(current_chunk_lines_str)

        chunks.append(full_chunk_str)
        chunk_line_ranges.append((chunk_start_y, len(grid)))

    total_parsed_ranges = []

    print(f"Processing {len(chunks)} chunks for topic extraction")

    for i, (chunk_text, (start_y, end_y)) in enumerate(zip(chunks, chunk_line_ranges)):
        prompt = prompt_template.replace("{grid_text}", chunk_text)
        prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

        cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})

        if cached_response:
            response = cached_response["response"]
            print(f"Chunk {i}: Using cached response")
        else:
            print(f"Chunk {i}: Calling LLM")
            response = llm.call([prompt])
            cache_collection.update_one(
                {"prompt_hash": prompt_hash},
                {"$set": {
                    "prompt_hash": prompt_hash,
                    "prompt": prompt,
                    "response": response,
                    "created_at": datetime.datetime.now()
                }},
                upsert=True
            )

        # Parse Response - extract (Y, X)-(Y, X) coordinates
        for line in response.strip().split('\n'):
            if ':' in line:
                parts = line.split(':', 1)
                t_name = parts[0].strip()
                coords_str = parts[1].strip()

                # Regex for (Y, X)-(Y, X)
                matches = re.findall(r'\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*-\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)', coords_str)

                for m in matches:
                    sy, sx, ey, ex = map(int, m)
                    total_parsed_ranges.append((t_name, sy, sx, ey, ex))

    # Reconstruct topics from ranges
    final_topics = {}
    final_sentences = []

    # Sort ranges by appearance (sy, sx)
    total_parsed_ranges.sort(key=lambda x: (x[1], x[2]))

    for t_name, sy, sx, ey, ex in total_parsed_ranges:
        # Extract text from grid
        segment_words = []

        # Validate coordinates
        sy = max(0, min(sy, len(grid) - 1))
        ey = max(0, min(ey, len(grid) - 1))

        # Loop from sy to ey
        for cy in range(sy, ey + 1):
            row_words = grid[cy]
            start_word = sx if cy == sy else 0
            end_word = ex if cy == ey else len(row_words) - 1

            # Bounds check
            start_word = max(0, min(start_word, len(row_words)))
            end_word = max(0, min(end_word, len(row_words) - 1))

            if start_word <= end_word:
                segment_words.extend(row_words[start_word: end_word + 1])

        sentence_text = " ".join(segment_words)
        if not sentence_text.strip():
            continue

        final_sentences.append(sentence_text)
        sent_idx = len(final_sentences)  # 1-based index

        norm_name = normalize_topic(t_name)
        if norm_name not in final_topics:
            final_topics[norm_name] = []
        final_topics[norm_name].append(sent_idx)

    # Format topics list
    topics_list = []
    for name, sent_indices in final_topics.items():
        topics_list.append({
            "name": name,
            "sentences": sorted(list(set(sent_indices)))
        })

    # Use final sentences if available, otherwise use original sentences
    final_sentences_to_use = final_sentences if final_sentences else sentences

    # Generate subtopics for each topic
    all_subtopics = []
    for topic in topics_list:
        if topic["sentences"] and topic["name"] != "no_topic":
            # Get the actual sentence texts for this topic
            topic_sentences = [final_sentences_to_use[idx - 1] for idx in topic["sentences"]]
            subtopics = generate_subtopics_for_topic(
                topic["name"], 
                topic_sentences, 
                topic["sentences"], 
                llm, 
                cache_collection
            )
            all_subtopics.extend(subtopics)
            print(f"  Generated {len(subtopics)} subtopics for topic '{topic['name']}'")

    # Update submission with results
    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(
        submission_id,
        {
            "topics": topics_list,
            "sentences": final_sentences_to_use,
            "subtopics": all_subtopics
        }
    )

    print(f"Topic extraction completed for submission {submission_id}: {len(topics_list)} topics, {len(all_subtopics)} subtopics, {len(final_sentences_to_use)} sentences")
