from fastapi import APIRouter, Depends, Request
import json
import re
import gzip
import os
import hashlib
import datetime
from urllib.parse import unquote
import html
from lib.llamacpp import LLamaCPP
from lib.storage.posts import PostsStorage
from lib.html_cleaner import HTMLCleaner
from pydantic import BaseModel

def normalize_topic(topic_name):
    """
    Normalize topic name to avoid duplicates due to case, spaces vs underscores, etc.
    """
    # Convert to lowercase
    normalized = topic_name.lower()
    # Replace spaces with underscores
    normalized = re.sub(r'\s+', '_', normalized)
    # Remove special characters except underscores
    normalized = re.sub(r'[^\w_]', '', normalized)
    # Remove multiple consecutive underscores
    normalized = re.sub(r'_+', '_', normalized)
    # Remove leading/trailing underscores
    normalized = normalized.strip('_')
    return normalized

class ArticleRequest(BaseModel):
    article: str

router = APIRouter()

def get_posts_storage(request: Request) -> PostsStorage:
    return request.app.state.posts_storage

@router.get("/themed-post/{tag}")
@router.get("/themed-post")
def get_themed_post(tag: str = None, limit: int = 10, posts_storage: PostsStorage = Depends(get_posts_storage)):
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
        llm = LLamaCPP("http://192.168.178.26:8989")
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


        results.append({
            "sentences": sentences,
            "topics": topics
        })
        print(results)

    return results

@router.post("/themed-post")
def post_themed_post(request: ArticleRequest, posts_storage: PostsStorage = Depends(get_posts_storage)):
    # Ensure the LLM cache collection exists with proper indexes
    if "llm_cache" not in posts_storage._db.list_collection_names():
        posts_storage._db.create_collection("llm_cache")
        posts_storage._db.llm_cache.create_index("prompt_hash", unique=True)

    # Use the provided article text
    article = request.article

    # Clean the text
    cleaner = HTMLCleaner()
    cleaner.purge()
    cleaner.feed(article)
    text = " ".join(cleaner.get_content())
    reg = re.compile(r"\s+")
    text = reg.sub(" ", text)
    text = text.strip()

    # Split text into words and add numbered markers
    words = text.split()
    if not words:
        return {"sentences": [], "topics": []}
    
    print(f"\n=== DEBUG: Total words: {len(words)} ===")
    print(f"First 10 words: {words[:10]}")
    
    # Create marked text with numbered markers between each word
    # Using |#N#| format where N is the position number (0-indexed positions between words)
    marked_parts = []
    for i, word in enumerate(words):
        marked_parts.append(word)
        if i < len(words) - 1:  # Don't add marker after the last word
            marked_parts.append(f"|#{i+1}#|")
    marked_text = " ".join(marked_parts)
    
    print(f"\n=== DEBUG: Marked text (first 500 chars) ===")
    print(marked_text[:500])
    print(f"... (total length: {len(marked_text)} chars)")
    
    # LLM client
    llm = LLamaCPP("http://192.168.178.26:8989", max_context_tokens=32000)
    #llm = LLamaCPP("http://127.0.0.1:8989")

    # Define the prompt template
    prompt_template = """You are given text where words are separated by numbered markers in the format |#N#| (where N is the position number).

Your task is to:
1. Identify topics/themes in the text
2. For each topic, specify which parts of the text belong to it by listing the marker numbers where sentences START and END

Output format (one topic per line):
topic_name: start1-end1, start2-end2, start3-end3

Example:
hockey: 0-5, 12-18
travel: 6-11
no_topic: 19-25

Important instructions:
- Use the marker numbers that are already in the text (e.g., |#5#| means marker 5)
- Each range is start-end (inclusive). A range "0-5" means from the beginning to marker |#5#|
- Use 0 as the start marker for text that begins at the start of the document
- Use the last marker number for text that extends to the end
- Keep topics specific but not overly detailed
- Aim for 3-7 topics total, merging similar themes where possible
- If text doesn't fit any clear topic, assign it to 'no_topic'
- Ranges for the same topic can be non-contiguous (separated by commas)

Text with numbered markers:
{text_chunk}"""

    # Calculate how much space we have for text (leaving room for the prompt template)
    template_tokens = llm.estimate_tokens(prompt_template.replace("{text_chunk}", ""))
    max_text_tokens = llm._LLamaCPP__max_context_tokens - template_tokens - 500  # 500 token buffer for response
    
    # Split marked_text into chunks if needed
    estimated_text_tokens = llm.estimate_tokens(marked_text)
    print(f"\n=== DEBUG: Estimated tokens - template: {template_tokens}, text: {estimated_text_tokens}, max for text: {max_text_tokens} ===")
    
    chunks = []
    if estimated_text_tokens <= max_text_tokens:
        # Text fits in one chunk
        chunks = [marked_text]
        print(f"=== DEBUG: Text fits in one chunk ===")
    else:
        # Need to split text into chunks
        # Calculate chunk size in characters (rough approximation)
        chunk_char_size = max_text_tokens * 4  # ~4 chars per token
        
        # Split by markers to ensure we don't break markers
        marker_positions = []
        i = 0
        while True:
            pos = marked_text.find('|#', i)
            if pos == -1:
                break
            marker_positions.append(pos)
            i = pos + 1
        
        print(f"=== DEBUG: Found {len(marker_positions)} markers, need to split into chunks ===")
        
        # Create chunks based on character size, but split at marker boundaries
        current_chunk_start = 0
        chunk_start_marker_idx = 0
        
        for i, marker_pos in enumerate(marker_positions):
            if marker_pos - current_chunk_start >= chunk_char_size:
                # Time to create a chunk
                chunk = marked_text[current_chunk_start:marker_pos].strip()
                if chunk:
                    chunks.append(chunk)
                    print(f"=== DEBUG: Created chunk {len(chunks)}: {len(chunk)} chars, markers {chunk_start_marker_idx} to ~{i} ===")
                current_chunk_start = marker_pos
                chunk_start_marker_idx = i
        
        # Add the last chunk
        if current_chunk_start < len(marked_text):
            chunk = marked_text[current_chunk_start:].strip()
            if chunk:
                chunks.append(chunk)
                print(f"=== DEBUG: Created final chunk {len(chunks)}: {len(chunk)} chars ===")
    
    print(f"\n=== DEBUG: Processing {len(chunks)} chunk(s) ===")
    
    # Process each chunk and collect responses
    all_responses = []
    cache_collection = posts_storage._db.llm_cache
    
    for chunk_idx, chunk in enumerate(chunks):
        prompt = prompt_template.replace("{text_chunk}", chunk)
        prompt_hash = hashlib.md5(prompt.encode()).hexdigest()
        
        # Check cache
        cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})
        
        if cached_response:
            response = cached_response["response"]
            print(f"\n=== DEBUG: Chunk {chunk_idx + 1}/{len(chunks)} - Using CACHED response ===")
        else:
            print(f"\n=== DEBUG: Chunk {chunk_idx + 1}/{len(chunks)} - Making NEW LLM call ===")
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
        
        print(f"=== DEBUG: Chunk {chunk_idx + 1} response (first 200 chars): {response[:200]} ===")
        all_responses.append(response)
    
    # Combine all responses
    combined_response = "\n".join(all_responses)
    print(f"\n=== DEBUG: Combined LLM response from {len(chunks)} chunk(s) ===")
    print(combined_response)

    # Parse response to extract topics and sentence ranges
    topics = []
    normalized_topics_map = {}
    all_ranges = []  # Collect all ranges to build sentences later
    
    # Process the combined response from all chunks
    for line in combined_response.strip().split('\n'):
        if ':' in line:
            topic_name, ranges_str = line.split(':', 1)
            topic_name = topic_name.strip()
            normalized_name = normalize_topic(topic_name)
            
            # Parse ranges (e.g., "0-5, 12-18")
            ranges = []
            for range_str in ranges_str.split(','):
                range_str = range_str.strip()
                if '-' in range_str:
                    parts = range_str.split('-')
                    if len(parts) == 2 and parts[0].strip().isdigit() and parts[1].strip().isdigit():
                        start = int(parts[0].strip())
                        end = int(parts[1].strip())
                        ranges.append((start, end))
                        all_ranges.append((start, end))
            
            if ranges:
                # Check if this normalized topic already exists
                if normalized_name in normalized_topics_map:
                    # Add ranges to existing topic
                    existing_topic_index = normalized_topics_map[normalized_name]
                    topics[existing_topic_index]["ranges"].extend(ranges)
                else:
                    # Create new topic
                    topic = {"name": normalized_name, "ranges": ranges}
                    topics.append(topic)
                    normalized_topics_map[normalized_name] = len(topics) - 1

    # Build sentences from all unique ranges
    unique_ranges = sorted(set(all_ranges))
    sentences = []
    sentence_range_map = {}  # Map sentence index to its range
    
    for start, end in unique_ranges:
        if start <= len(words) and end <= len(words) and start < end:
            sentence_words = words[start:end]
            sentence = " ".join(sentence_words)
            if sentence.strip():
                sentence_idx = len(sentences)
                sentences.append(sentence.strip())
                sentence_range_map[sentence_idx] = (start, end)
    
    # Convert topic ranges to sentence indices
    for topic in topics:
        sentence_indices = []
        for topic_range in topic["ranges"]:
            # Find which sentences correspond to this range
            for sent_idx, sent_range in sentence_range_map.items():
                if sent_range == topic_range:
                    sentence_indices.append(sent_idx + 1)  # 1-indexed for output
        topic["sentences"] = sorted(list(set(sentence_indices)))
        del topic["ranges"]  # Remove the ranges, keep only sentence numbers
    
    print(f"\n=== DEBUG: Built {len(sentences)} sentences ===")
    for i, sent in enumerate(sentences[:5]):
        print(f"Sentence {i+1}: {sent[:100]}{'...' if len(sent) > 100 else ''}")
    if len(sentences) > 5:
        print(f"... and {len(sentences) - 5} more sentences")
    
    print(f"\n=== DEBUG: Final topics ===")
    for topic in topics:
        print(f"Topic '{topic['name']}': sentences {topic['sentences']}")

    print(f"\n=== DEBUG: Returning result with {len(sentences)} sentences and {len(topics)} topics ===\n")

    # Build a summary by chunking sentences and summarizing each chunk via LLM (do not send whole post at once)
    def summarize_by_sentence_groups(sent_list, llm_client, cache_collection, max_groups_tokens_buffer=400):
        chunks = []
        current = []
        current_indices = []  # Track which sentence indices are in each chunk
        current_tokens = 0
        prompt_template = (
            "Summarize the following sentences into a concise paragraph focusing on key points and main ideas.\n"
            "- Keep it objective and avoid repetition.\n"
            "- Do not exceed 3-4 sentences.\n"
            "- Number each sentence in your summary as [1], [2], [3], etc.\n\n"
            "Sentences:\n{sentences}\n\nSummary:"
        )
        template_tokens = llm_client.estimate_tokens(prompt_template.replace("{sentences}", ""))
        max_text_tokens = llm_client._LLamaCPP__max_context_tokens - template_tokens - max_groups_tokens_buffer
        max_text_tokens = max(512, max_text_tokens)
        for idx, s in enumerate(sent_list):
            t = llm_client.estimate_tokens(s)
            if current and (current_tokens + t) > max_text_tokens:
                chunks.append((current, current_indices))
                current = [s]
                current_indices = [idx]
                current_tokens = t
            else:
                current.append(s)
                current_indices.append(idx)
                current_tokens += t
        if current:
            chunks.append((current, current_indices))

        summaries = []
        summary_mappings = []  # List of mappings for each summary sentence
        
        for ch, indices in chunks:
            sentences_text = "\n".join(f"- {s}" for s in ch)
            prompt = prompt_template.replace("{sentences}", sentences_text)
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
            
            # Parse the numbered summary sentences
            summary_text = resp.strip()
            summaries.append(summary_text)
            
            # Extract individual summary sentences (look for [N] markers)
            # Each summary sentence maps to all source sentence indices in this chunk
            summary_sentences = re.split(r'\[\d+\]\s*', summary_text)
            summary_sentences = [s.strip() for s in summary_sentences if s.strip()]
            
            # Map each summary sentence to the source sentences (1-indexed for output)
            for sum_sent in summary_sentences:
                if sum_sent:
                    summary_mappings.append({
                        "summary_sentence": sum_sent,
                        "source_sentences": [i + 1 for i in indices]  # 1-indexed
                    })
        
        combined_summary = "\n\n".join(summaries).strip()
        return combined_summary, summary_mappings

    combined_summary, summary_mappings = summarize_by_sentence_groups(sentences, llm, cache_collection)
    print(f"\n=== DEBUG: Final summary: {combined_summary} ===\n")
    print(f"\n=== DEBUG: Summary mappings: {summary_mappings} ===\n")
    return {
        "sentences": sentences,
        "topics": topics,
        "summary": combined_summary,
        "summary_mappings": summary_mappings
    }
