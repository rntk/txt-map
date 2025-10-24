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
        prompt = f"""
Group the following sentences into a hierarchy of chapters and subchapters.
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

{focus}

Sentences:
{numbered_text}
"""

        # Create a hash of the prompt for caching
        prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

        # Check if we have a cached response
        cache_collection = posts_storage._db.llm_cache
        cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})

        if cached_response:
            # Use cached response
            response = cached_response["response"]
        else:
            # Make LLM call and cache the result
            response = llm.call([prompt])

            # Store in cache (using upsert to avoid duplicates)
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

        # Parse response
        topics = []
        normalized_topics_map = {}  # Dictionary to track normalized topic names
        assigned_sentences = set()
        for line in response.strip().split('\n'):
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
    #llm = LLamaCPP("http://192.168.178.26:8989")
    llm = LLamaCPP("http://127.0.0.1:8989")

    # Ask LLM to group text by topics and provide sentence boundaries
    prompt = f"""
You are given text where words are separated by numbered markers in the format |#N#| (where N is the position number).

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
{marked_text}
"""

    # Create a hash of the prompt for caching
    prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

    # Check if we have a cached response
    cache_collection = posts_storage._db.llm_cache
    cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})

    if cached_response:
        response = cached_response["response"]
        print("\n=== DEBUG: Using CACHED response ===")
    else:
        print("\n=== DEBUG: Making NEW LLM call ===")
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

    print(f"\n=== DEBUG: LLM response ===")
    print(response)

    # Parse response to extract topics and sentence ranges
    topics = []
    normalized_topics_map = {}
    all_ranges = []  # Collect all ranges to build sentences later
    
    for line in response.strip().split('\n'):
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

    return {
        "sentences": sentences,
        "topics": topics
    }
