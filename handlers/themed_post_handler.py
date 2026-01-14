from fastapi import APIRouter, Depends, Request
import json
import re
import gzip
import os
import hashlib
import datetime
from urllib.parse import unquote
import html
from lib.llm.llamacpp import LLamaCPP
from lib.storage.posts import PostsStorage
from lib.html_cleaner import HTMLCleaner
from lib.summarizer import summarize_by_sentence_groups
from lib.article_splitter import split_article_with_markers, build_sentences_from_ranges, chunk_marked_text
from pydantic import BaseModel

def mark_words_in_sentence(sentence: str):
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
    sentence_boundaries = [] # List of (start_word_idx, end_word_idx) for each sentence in combined_text
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
    mindmap_topics = [] # List of hierarchies, each starts with topic_name
    sentence_to_hierarchies = {} # Map original_sentence_index -> list of hierarchies

    for line in mindmap_response.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
            
        # Split by comma to get hierarchy
        parts = [p.strip() for p in line.split(',')]
        if not parts:
            continue
            
        current_hierarchy = [topic_name] # Root of the mindmap is the topic name
        valid_line = True
        line_ranges = []
        
        for i, part in enumerate(parts):
            # Parse range start-end
            if '-' in part:
                # Remove any non-digit/dash chars just in case
                clean_part = "".join(c for c in part if c.isdigit() or c == '-')
                range_parts = clean_part.split('-')
                
                if len(range_parts) == 2 and range_parts[0] and range_parts[1]:
                    try:
                        r_start = int(range_parts[0])
                        r_end = int(range_parts[1])
                        
                        # Validate indices
                        if 0 <= r_start <= r_end < len(sentence_words):
                            # Extract text
                            topic_text = " ".join(sentence_words[r_start:r_end+1])
                            
                            # Avoid duplicating the parent topic name or consecutive identical topics
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
            # A hierarchy belongs to a sentence if any of its word ranges overlap with that sentence
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
        # Skip the first level (topic_name) because it's already the key in the top-level topic_mindmaps dict
        for topic in topic_hierarchy[1:]:
            if topic not in current_level:
                current_level[topic] = {}
            current_level = current_level[topic]

    # Build mindmap_results format for this topic
    mindmap_results = []
    for i, orig_idx in enumerate(sentence_indices):
        hierarchies = sentence_to_hierarchies.get(orig_idx, [[topic_name]]) # At least belongs to the root topic
        mindmap_results.append({
            "sentence_index": orig_idx,
            "sentence": sentences[i],
            "mindmap_topics": hierarchies
        })

    return structure, mindmap_results

def generate_subtopics_for_topic(topic_name, sentences, sentence_indices, llm, cache_collection):
    """
    Generate subtopics for a specific chapter/topic.
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

def normalize_topic(topic_name):
    """
    Normalize topic name to avoid duplicates due to case, spaces vs underscores, etc.
    """
    # Single regex: convert to lowercase, replace non-alphanumeric with underscores, strip edges
    return re.sub(r'[^a-z0-9]+', '_', topic_name.lower()).strip('_')

def refine_no_topic_assignments(sentences, topics, llm, cache_collection):
    """
    Refine assignments for sentences marked as 'no_topic' by checking if they
    actually belong to the previous or next topic.
    """
    if not topics:
        return topics
    
    # Sort topics by their first sentence to have them in order
    topics.sort(key=lambda x: min(x["sentences"]) if x.get("sentences") else 999999)
    
    no_topic_index = -1
    for i, t in enumerate(topics):
        if t["name"] == normalize_topic("no_topic"):
            no_topic_index = i
            break
            
    if no_topic_index == -1 or not topics[no_topic_index]["sentences"]:
        return topics
        
    no_topic_sentences = topics[no_topic_index]["sentences"]
    other_topics = [t for i, t in enumerate(topics) if i != no_topic_index]
    
    # Find contiguous ranges in no_topic_sentences
    ranges = []
    if no_topic_sentences:
        start = no_topic_sentences[0]
        prev = start
        for n in no_topic_sentences[1:]:
            if n > prev + 1:
                ranges.append((start, prev))
                start = n
            prev = n
        ranges.append((start, prev))

    print(f"[DEBUG] refine_no_topic_assignments: Found {len(ranges)} no_topic ranges: {ranges}")

    refined_assignments = [] # List of (range_start, range_end, target_topic_name or None)
    
    for r_start, r_end in ranges:
        prev_topic = None
        next_topic = None
        
        # Find topics containing r_start - 1 and r_end + 1
        for t in other_topics:
            if (r_start - 1) in t.get("sentences", []):
                prev_topic = t
            if (r_end + 1) in t.get("sentences", []):
                next_topic = t
        
        print(f"[DEBUG] Range {r_start}-{r_end}: prev_topic='{prev_topic['name'] if prev_topic else None}', next_topic='{next_topic['name'] if next_topic else None}'")

        if not prev_topic and not next_topic:
            print(f"[DEBUG] Range {r_start}-{r_end}: No adjacent topics (at {r_start-1} or {r_end+1}), skipping refinement.")
            continue

        context_prev = ""
        if prev_topic:
            # Get up to 3 last sentences of prev_topic for better context
            last_indices = prev_topic["sentences"][-3:]
            context_prev_text = " ".join([sentences[idx-1] for idx in last_indices])
            context_prev = f"<previous_topic name=\"{prev_topic['name']}\">\n{context_prev_text}\n</previous_topic>"
        
        context_next = ""
        if next_topic:
            # Get up to 3 first sentences of next_topic for better context
            first_indices = next_topic["sentences"][:3]
            context_next_text = " ".join([sentences[idx-1] for idx in first_indices])
            context_next = f"<next_topic name=\"{next_topic['name']}\">\n{context_next_text}\n</next_topic>"
        
        no_topic_text = " ".join([sentences[idx-1] for idx in range(r_start, r_end + 1)])
        
        prev_text = context_prev if context_prev else "<previous_topic>\nN/A\n</previous_topic>"
        next_text = context_next if context_next else "<next_topic>\nN/A\n</next_topic>"

        prompt = f"""You are an assistant helping to group sentences into topics. 
Some sentences were missed during initial processing and assigned to 'no_topic'.
Most likely, they belong to either the PREVIOUS topic or the NEXT topic.
Decide if the 'SENTENCES TO RE-ASSIGN' belong to the PREVIOUS topic, the NEXT topic, or NEITHER (keep as no_topic).
Respond with only one word: 'PREVIOUS', 'NEXT', or 'NEITHER'.

{prev_text}

<sentences_to_reassign>
{no_topic_text}
</sentences_to_reassign>

{next_text}
"""
        
        prompt_hash = hashlib.md5(prompt.encode()).hexdigest()
        cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})
        
        if cached_response:
            decision = cached_response["response"].strip().upper()
            print(f"[DEBUG] Range {r_start}-{r_end}: LLM decision (CACHED): {decision}")
        else:
            decision = llm.call([prompt]).strip().upper()
            print(f"[DEBUG] Range {r_start}-{r_end}: LLM decision (NEW): {decision}")
            cache_collection.update_one(
                {"prompt_hash": prompt_hash},
                {"$set": {
                    "prompt_hash": prompt_hash,
                    "prompt": prompt,
                    "response": decision,
                    "created_at": datetime.datetime.now()
                }},
                upsert=True
            )
        
        if "PREVIOUS" in decision and prev_topic:
            print(f"[DEBUG] Range {r_start}-{r_end}: Merging into PREVIOUS topic '{prev_topic['name']}'")
            refined_assignments.append((r_start, r_end, prev_topic["name"]))
        elif "NEXT" in decision and next_topic:
            print(f"[DEBUG] Range {r_start}-{r_end}: Merging into NEXT topic '{next_topic['name']}'")
            refined_assignments.append((r_start, r_end, next_topic["name"]))
        else:
            print(f"[DEBUG] Range {r_start}-{r_end}: Keeping as no_topic (decision: {decision})")
            refined_assignments.append((r_start, r_end, None))

    # Apply refined assignments
    if refined_assignments:
        new_no_topic_sentences = []
        assignment_map = { (r_start, r_end): target for r_start, r_end, target in refined_assignments }
        
        # We need to rebuild topics
        for r_start, r_end in ranges:
            target_name = assignment_map.get((r_start, r_end))
            if target_name:
                for t in topics:
                    if t["name"] == target_name:
                        t["sentences"].extend(range(r_start, r_end + 1))
                        t["sentences"] = sorted(list(set(t["sentences"])))
                        break
            else:
                new_no_topic_sentences.extend(range(r_start, r_end + 1))
        
        topics[no_topic_index]["sentences"] = sorted(new_no_topic_sentences)
        
        # If no_topic became empty, remove it? 
        # Actually, let's keep it if it's there but empty, or filter later.
        if not topics[no_topic_index]["sentences"]:
            topics.pop(no_topic_index)

    return topics

class ArticleRequest(BaseModel):
    article: str

router = APIRouter()

def get_posts_storage(request: Request) -> PostsStorage:
    return request.app.state.posts_storage

def get_llamacpp(request: Request) -> LLamaCPP:
    return request.app.state.llamacpp

@router.get("/themed-post/{tag}")
@router.get("/themed-post")
def get_themed_post(tag: str = None, limit: int = 10, posts_storage: PostsStorage = Depends(get_posts_storage), llamacpp: LLamaCPP = Depends(get_llamacpp)):
    # Ensure the LLM cache collection exists with proper indexes
    if "llm_cache" not in posts_storage._db.list_collection_names():
        posts_storage._db.create_collection("llm_cache")
        posts_storage._db.llm_cache.create_index("prompt_hash", unique=True)

    # Decode/unescape tag if provided
    if tag is not None:
        tag = html.unescape(unquote(tag))

    user = posts_storage._db.users.find_one()
    if not user:
        return {"error": "No users found"}
    owner = user['sid']
    print(owner, tag)
    if tag:
        posts = list(posts_storage.get_by_tags(owner, [tag]))
    else:
        posts = list(posts_storage.get_all(owner))

    # Apply the limit to the number of posts
    posts = posts[:limit]

    articles = []
    cleaner = HTMLCleaner()
    reg = re.compile(r"\s+")
    for post in posts:
        cleaner.purge()
        text = (
            post["content"]["title"]
            + " "
            + gzip.decompress(post["content"]["content"]).decode("utf-8", "replace")
        )
        cleaner.feed(text)
        text = " ".join(cleaner.get_content())
        text = reg.sub(" ", text)
        articles.append(text.strip())

    print(articles)

    results = []
    for article in articles:
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', article.strip())
        sentences = [s.strip() for s in sentences if s.strip()]

        if not sentences:
            continue

        # Join with numbers
        numbered_sentences = [f"{i+1}. {s}" for i, s in enumerate(sentences)]
        numbered_text = '\n'.join(numbered_sentences)

        # LLM client
        llm = llamacpp
        #llm = LLamaCPP("http://127.0.0.1:8989")

        focus = f"Focus on the theme '{tag}' when grouping the sentences. But do not ignore other potential themes.\n" if tag else ""
        
        prompt_template = """Group the following sentences into a hierarchy of chapters and subchapters.
- First, determine a small set of main, general chapters that summarize the article's high-level themes.
- Then, under each main chapter, create more detailed subchapters that are specific and coherent.

Output format MUST remain exactly as following (no extra text):
<topic_name>: <comma-separated sentence numbers>
Examples:
Sport - Hockey: 1,3
Travel - Budget Tips: 2,4
no_topic: 5

Important instructions:
- Encode hierarchy in the topic name using "Chapter - Subchapter" (use a hyphen and a single space on both sides). Do NOT use a colon in topic names because the colon separates the name from the numbers.
- Keep chapters general and subchapters specific; merge closely related themes to avoid fragmentation.
- Aim for 3-7 main chapters total. You may have multiple subchapters per chapter.
- Every line must map a topic (chapter or chapter - subchapter) to sentence numbers.
- Use the exact sentence numbers as provided (e.g., if the text lists "1.", "2.", etc., use those numbers in your output).
- If a sentence doesn't fit any clear topic, assign it to 'no_topic'.
- Avoid creating multiple topics that differ only slightly in phrasing.

{focus_text}

Sentences:
{sentences_text}"""

        # Calculate token budget
        template_tokens = llm.estimate_tokens(prompt_template.replace("{focus_text}", focus).replace("{sentences_text}", ""))
        max_text_tokens = llm._LLamaCPP__max_context_tokens - template_tokens - 500
        
        # Check if we need to chunk
        estimated_text_tokens = llm.estimate_tokens(numbered_text)
        
        chunks = []
        chunk_sentence_ranges = []  # Track which sentence indices belong to each chunk
        
        if estimated_text_tokens <= max_text_tokens:
            chunks = [numbered_text]
            chunk_sentence_ranges = [(0, len(sentences))]
        else:
            # Split sentences into chunks
            current_chunk_sentences = []
            current_chunk_size = 0
            chunk_start_idx = 0
            
            for i, sent in enumerate(numbered_sentences):
                sent_tokens = llm.estimate_tokens(sent)
                
                if current_chunk_size + sent_tokens > max_text_tokens and current_chunk_sentences:
                    # Save current chunk
                    chunks.append('\n'.join(current_chunk_sentences))
                    chunk_sentence_ranges.append((chunk_start_idx, chunk_start_idx + len(current_chunk_sentences)))
                    
                    # Start new chunk
                    current_chunk_sentences = [sent]
                    current_chunk_size = sent_tokens
                    chunk_start_idx = i
                else:
                    current_chunk_sentences.append(sent)
                    current_chunk_size += sent_tokens
            
            # Add last chunk
            if current_chunk_sentences:
                chunks.append('\n'.join(current_chunk_sentences))
                chunk_sentence_ranges.append((chunk_start_idx, chunk_start_idx + len(current_chunk_sentences)))
        
        # Process each chunk
        all_responses = []
        cache_collection = posts_storage._db.llm_cache
        
        for chunk_idx, (chunk, (start_idx, end_idx)) in enumerate(zip(chunks, chunk_sentence_ranges)):
            prompt = prompt_template.replace("{focus_text}", focus).replace("{sentences_text}", chunk)
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
            
            all_responses.append(response)
        
        # Combine responses
        combined_response = "\n".join(all_responses)

        # Parse response
        topics = []
        normalized_topics_map = {}  # Dictionary to track normalized topic names
        assigned_sentences = set()
        for line in combined_response.strip().split('\n'):
            if ':' in line:
                topic_name, nums = line.split(':', 1)
                topic_name = topic_name.strip()
                # Normalize the topic name
                normalized_name = normalize_topic(topic_name)
                nums = [int(n.strip()) for n in nums.split(',') if n.strip().isdigit()]

                # Check if this normalized topic already exists
                if normalized_name in normalized_topics_map:
                    # Add sentences to existing topic
                    existing_topic_index = normalized_topics_map[normalized_name]
                    topics[existing_topic_index]["sentences"].extend(nums)
                    topics[existing_topic_index]["sentences"] = sorted(list(set(topics[existing_topic_index]["sentences"])))
                else:
                    # Create new topic with normalized name
                    topic = {"name": normalized_name, "sentences": nums}
                    topics.append(topic)
                    normalized_topics_map[normalized_name] = len(topics) - 1

                assigned_sentences.update(nums)

        # Check for unassigned sentences and add to "no_topic"
        total_sentences = len(sentences)
        unassigned = [i+1 for i in range(total_sentences) if i+1 not in assigned_sentences]
        if unassigned:
            # Check if "no_topic" already exists
            normalized_no_topic = normalize_topic("no_topic")
            if normalized_no_topic in normalized_topics_map:
                # Add sentences to existing no_topic
                existing_topic_index = normalized_topics_map[normalized_no_topic]
                topics[existing_topic_index]["sentences"].extend(unassigned)
                topics[existing_topic_index]["sentences"] = sorted(list(set(topics[existing_topic_index]["sentences"])))
            else:
                # Create new no_topic
                no_topic = {"name": normalized_no_topic, "sentences": sorted(unassigned)}
                topics.append(no_topic)
                normalized_topics_map[normalized_no_topic] = len(topics) - 1

        # Refine no_topic assignments
        topics = refine_no_topic_assignments(sentences, topics, llm, cache_collection)

        # Generate mindmaps for topics
        topic_mindmaps = {}
        all_mindmap_results = []
        for topic in topics:
            if topic["sentences"]:
                topic_sentences = [sentences[idx - 1] for idx in topic["sentences"]]
                structure, results = generate_mindmap_for_topic(topic["name"], topic_sentences, topic["sentences"], llm, cache_collection)
                topic_mindmaps[topic["name"]] = structure
                all_mindmap_results.extend(results)

        # Generate summaries for each topic
        topic_summaries = {}
        for topic in topics:
            if topic["sentences"]:
                topic_sentences = [sentences[idx - 1] for idx in topic["sentences"]]
                topic_summary_sentences, _ = summarize_by_sentence_groups(topic_sentences, llm, cache_collection)
                topic_summaries[topic["name"]] = " ".join(topic_summary_sentences)

        # Generate subtopics for each topic
        all_subtopics = []
        for topic in topics:
            if topic["sentences"] and topic["name"] != "no_topic":
                topic_sentences = [sentences[idx - 1] for idx in topic["sentences"]]
                subtopics = generate_subtopics_for_topic(topic["name"], topic_sentences, topic["sentences"], llm, cache_collection)
                all_subtopics.extend(subtopics)

        results.append({
            "sentences": sentences,
            "topics": topics,
            "topic_summaries": topic_summaries,
            "topic_mindmaps": topic_mindmaps,
            "mindmap_results": all_mindmap_results,
            "subtopics": all_subtopics
        })
        print(results)

    return results


def create_coordinate_grid(text):
    """
    Split text into a grid of words (Lines x Words).
    Returns:
        grid: List of List of words.
        rows: List of original sentence strings (lines).
    """
    # Split into candidate lines/sentences using regex
    # We use a pattern that keeps the delimiter if possible, or just standard split
    # For now, standard split by sentence terminators seems appropriate as the "Y axis base"
    rows = re.split(r'(?<=[.!?])\s+', text.strip())
    rows = [r.strip() for r in rows if r.strip()]
    
    grid = []
    for row in rows:
        words = row.split()
        grid.append(words)
        
    return grid, rows

@router.post("/themed-post")
def post_themed_post(request: ArticleRequest, posts_storage: PostsStorage = Depends(get_posts_storage), llamacpp: LLamaCPP = Depends(get_llamacpp)):
    # Ensure the LLM cache collection exists with proper indexes
    if "llm_cache" not in posts_storage._db.list_collection_names():
        posts_storage._db.create_collection("llm_cache")
        posts_storage._db.llm_cache.create_index("prompt_hash", unique=True)

    # Use the provided article text
    article = request.article

    # LLM client
    llm = llamacpp
    
    # Create coordinate grid
    grid, rows = create_coordinate_grid(article)
    
    if not grid:
        return {"sentences": [], "topics": []}

    # Debug: Save prompts
    debug_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "debug_prompts")
    os.makedirs(debug_dir, exist_ok=True)

    # Prompt Template
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

    # We need to chunk if the grid is too large
    # Estimate tokens for the grid representation
    # Grid representation:
    # X: 0 1 2 ...
    # 0: Word0 Word1 ...
    # 1: ...
    
    grid_lines = []
    
    # Pre-calculate lines to chunk them comfortably
    for i, words in enumerate(grid):
        line_str = f"{i}: " + " ".join(words)
        grid_lines.append((words, line_str)) # Store words to calculate max_len later
    
    chunks = []
    chunk_line_ranges = [] # (start_y, end_y)
    
    max_tokens = llm._LLamaCPP__max_context_tokens - 1000 
    
    current_chunk_lines_str = []
    current_chunk_words = []
    current_chunk_len = 0
    chunk_start_y = 0
    
    for i, (words, line_str) in enumerate(grid_lines):
        # Estimate
        line_len = len(line_str)
        
        if current_chunk_len + line_len > max_tokens * 3: # Rough char override
             if llm.estimate_tokens("\n".join(current_chunk_lines_str) + line_str) > max_tokens:
                 # Finalize current chunk
                 # Build Header
                 max_w = 0
                 for w_list in current_chunk_words:
                     max_w = max(max_w, len(w_list))
                 
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
        max_w = 0
        for w_list in current_chunk_words:
             max_w = max(max_w, len(w_list))
        header = "X: " + " ".join([str(x) for x in range(max_w)])
        full_chunk_str = header + "\n" + "\n".join(current_chunk_lines_str)
        
        chunks.append(full_chunk_str)
        chunk_line_ranges.append((chunk_start_y, len(grid_lines)))

    all_responses = []
    cache_collection = posts_storage._db.llm_cache
    
    total_parsed_ranges = [] # list of (topic_name, start_y, start_x, end_y, end_x)
    
    print(f"\n=== DEBUG: Processing {len(chunks)} chunks ===")

    for i, (chunk_text, (start_y, end_y)) in enumerate(zip(chunks, chunk_line_ranges)):
        # We need to adjust Y coordinates in the prompt/response if we want them absolute?
        # Or we keep them relative to chunk and offset them?
        # The prompt shows Y from start_y to end_y.
        # It is better to show actual Y values so we don't need to re-map.
        # The text was built with "0: ...", "1: ...".
        # So the chunk text already has absolute Y indices if we built grid_lines all at once.
        # Yes, grid_lines[i] starts with "{i}:".
        
        prompt = prompt_template.replace("{grid_text}", chunk_text)
        
        # Save Prompt to Debug File
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        debug_filename = f"grid_prompt_chunk_{i}_{timestamp}.txt"
        debug_path = os.path.join(debug_dir, debug_filename)
        with open(debug_path, "w") as f:
            f.write(prompt)
        print(f"[DEBUG] Saved prompt to {debug_path}")
        
        prompt_hash = hashlib.md5(prompt.encode()).hexdigest()
        
        cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})
        
        if cached_response:
            response = cached_response["response"]
            print(f"=== Chunk {i}: Cached Response ===")
        else:
            print(f"=== Chunk {i}: Calling LLM ===")
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
            
        print(f"Response: {response[:200]}...")
        
        # Parse Response
        for line in response.strip().split('\n'):
            if ':' in line:
                parts = line.split(':', 1)
                t_name = parts[0].strip()
                coords_str = parts[1].strip()
                
                # Regex for (Y, X)-(Y, X)
                # Pattern: \(\s*(\d+)\s*,\s*(\d+)\s*\)\s*-\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)
                matches = re.findall(r'\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*-\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)', coords_str)
                
                for m in matches:
                    sy, sx, ey, ex = map(int, m)
                    # Coordinates are absolute Y because defined in prompt
                    total_parsed_ranges.append((t_name, sy, sx, ey, ex))

    # Reconstruct Sentences defined by ranges
    # We will slice the grid based on ranges.
    # Each range becomes a "Sentence" string.
    # We also assign it to the topic.
    
    final_topics = {} # name -> list of sentence indices (1-based)
    final_sentences = []
    
    # Sort ranges by appearance (sy, sx)
    image_sentences = []
    
    total_parsed_ranges.sort(key=lambda x: (x[1], x[2]))
    
    for t_name, sy, sx, ey, ex in total_parsed_ranges:
        # Extract text
        segment_words = []
        
        # Validate coordinates
        sy = max(0, min(sy, len(grid)-1))
        ey = max(0, min(ey, len(grid)-1))
        
        # Loop from sy to ey
        for cy in range(sy, ey + 1):
            row_words = grid[cy]
            start_word = sx if cy == sy else 0
            end_word = ex if cy == ey else len(row_words) - 1
            
            # Bounds check
            start_word = max(0, min(start_word, len(row_words))) # Allow index=len for empty? No words are 0..len-1
            end_word = max(0, min(end_word, len(row_words)-1))
            
            if start_word <= end_word:
                 segment_words.extend(row_words[start_word : end_word+1])
        
        sentence_text = " ".join(segment_words)
        if not sentence_text.strip():
            continue
            
        final_sentences.append(sentence_text)
        sent_idx = len(final_sentences) # 1-based index
        
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
        
    # Generate summaries etc (reusing existing valid logic)
    # Copied from original
    topic_summaries = {}
    topic_mindmaps = {}
    all_mindmap_results = []
    all_subtopics = []
    
    # Summary of whole article (from final_sentences)
    summary_sentences, summary_mappings = summarize_by_sentence_groups(final_sentences, llm, cache_collection)

    for topic in topics_list:
        if topic["sentences"] and topic["name"] != "no_topic":
            topic_sentences_text = [final_sentences[idx - 1] for idx in topic["sentences"]]
            
            # Summary
            ts_summary, _ = summarize_by_sentence_groups(topic_sentences_text, llm, cache_collection)
            topic_summaries[topic["name"]] = " ".join(ts_summary)
            
            # Mindmap
            structure, results = generate_mindmap_for_topic(topic["name"], topic_sentences_text, topic["sentences"], llm, cache_collection)
            topic_mindmaps[topic["name"]] = structure
            all_mindmap_results.extend(results)
            
            # Subtopics
            subtopics = generate_subtopics_for_topic(topic["name"], topic_sentences_text, topic["sentences"], llm, cache_collection)
            all_subtopics.extend(subtopics)

    return {
        "sentences": final_sentences,
        "topics": topics_list,
        "summary": summary_sentences,
        "summary_mappings": summary_mappings,
        "topic_summaries": topic_summaries,
        "topic_mindmaps": topic_mindmaps,
        "mindmap_results": all_mindmap_results,
        "subtopics": all_subtopics,
        "paragraph_map": {}, # Not tracking paragraphs in this new mode yet
        "formatted": True
    }
