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

    # Split text into words and add markers
    words = text.split()
    if not words:
        return {"sentences": [], "topics": []}
    
    print(f"\n=== DEBUG: Total words: {len(words)} ===")
    print(f"First 10 words: {words[:10]}")
    
    # Create marked text with numbered boundary markers between each word
    # Using |#N#| format where N is the position number
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

    # Step 1: Ask LLM to identify sentence boundaries
    sentence_split_prompt = f"""
You are given text where words are separated by numbered markers in the format |#N#| (where N is the position number).
Your task is to identify where sentence boundaries should be placed.

Output ONLY the marker numbers where a sentence should END, separated by commas.
For example, if sentence 1 ends after marker |#5#| and sentence 2 ends after marker |#10#|, output: 5,10

Important:
- The markers already contain their position numbers - just copy those numbers to your output
- Only output numbers separated by commas, nothing else
- A sentence typically ends after words with periods, question marks, or exclamation points
- The last sentence should end at the final marker

Text with numbered markers:
{marked_text}
"""

    # Create a hash of the prompt for caching
    split_prompt_hash = hashlib.md5(sentence_split_prompt.encode()).hexdigest()

    # Check if we have a cached response for sentence splitting
    cache_collection = posts_storage._db.llm_cache
    cached_split_response = cache_collection.find_one({"prompt_hash": split_prompt_hash})

    if cached_split_response:
        split_response = cached_split_response["response"]
        print("\n=== DEBUG: Using CACHED sentence split response ===")
    else:
        print("\n=== DEBUG: Making NEW LLM call for sentence splitting ===")
        split_response = llm.call([sentence_split_prompt])
        cache_collection.update_one(
            {"prompt_hash": split_prompt_hash},
            {"$set": {
                "prompt_hash": split_prompt_hash,
                "prompt": sentence_split_prompt,
                "response": split_response,
                "created_at": datetime.datetime.now()
            }},
            upsert=True
        )

    print(f"\n=== DEBUG: LLM sentence split response ===")
    print(split_response)

    # Parse boundary positions
    boundary_positions = []
    split_response_clean = split_response.strip()
    for num in split_response_clean.split(','):
        num = num.strip()
        if num.isdigit():
            boundary_positions.append(int(num))
    
    # Sort and ensure boundaries are valid
    boundary_positions = sorted(set(boundary_positions))
    
    print(f"\n=== DEBUG: Parsed boundary positions ===")
    print(f"Boundaries: {boundary_positions}")
    
    # Build sentences from boundaries
    sentences = []
    start_pos = 0
    for end_pos in boundary_positions:
        if end_pos <= len(words) and end_pos > start_pos:
            sentence_words = words[start_pos:end_pos]
            sentences.append(" ".join(sentence_words))
            start_pos = end_pos
    
    # Add any remaining words as the last sentence
    if start_pos < len(words):
        sentences.append(" ".join(words[start_pos:]))
    
    # Filter empty sentences
    sentences = [s.strip() for s in sentences if s.strip()]
    
    print(f"\n=== DEBUG: Built {len(sentences)} sentences ===")
    for i, sent in enumerate(sentences[:5]):  # Show first 5 sentences
        print(f"Sentence {i+1}: {sent[:100]}{'...' if len(sent) > 100 else ''}")
    if len(sentences) > 5:
        print(f"... and {len(sentences) - 5} more sentences")
    
    if not sentences:
        return {"sentences": [], "topics": []}

    # Step 2: Now group sentences by topic
    numbered_sentences = [f"{i+1}. {s}" for i, s in enumerate(sentences)]
    numbered_text = '\n'.join(numbered_sentences)

    print(f"\n=== DEBUG: Numbered text for topic grouping (first 500 chars) ===")
    print(numbered_text[:500])

    topic_prompt = f"""
Group the following sentences by topic/theme. 
For each topic, write the topic name followed by a colon and the list of sentence numbers separated by commas.

Guidelines for topic naming:
- Keep topics specific but not overly detailed. Prefer more specific terms over general ones (e.g., if sentences mention both "sport" and "hockey", use "hockey" as the topic).
- Use concise topic names that capture the core theme without unnecessary elaboration.
- Aim for 3-7 topics in total, merging similar themes where possible to avoid fragmentation.
- If a sentence doesn't fit any clear topic, group it under 'no_topic'.

Output format:
topic_1: 1,3
topic_2: 2,4
no_topic: 5

Sentences:
{numbered_text}
"""

    # Create a hash of the prompt for caching
    topic_prompt_hash = hashlib.md5(topic_prompt.encode()).hexdigest()

    # Check if we have a cached response
    cached_topic_response = cache_collection.find_one({"prompt_hash": topic_prompt_hash})

    if cached_topic_response:
        response = cached_topic_response["response"]
        print("\n=== DEBUG: Using CACHED topic grouping response ===")
    else:
        print("\n=== DEBUG: Making NEW LLM call for topic grouping ===")
        response = llm.call([topic_prompt])
        cache_collection.update_one(
            {"prompt_hash": topic_prompt_hash},
            {"$set": {
                "prompt_hash": topic_prompt_hash,
                "prompt": topic_prompt,
                "response": response,
                "created_at": datetime.datetime.now()
            }},
            upsert=True
        )

    print(f"\n=== DEBUG: LLM topic grouping response ===")
    print(response)

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

    print(f"\n=== DEBUG: Final topics ===")
    for topic in topics:
        print(f"Topic '{topic['name']}': sentences {topic['sentences']}")

    print(f"\n=== DEBUG: Returning result with {len(sentences)} sentences and {len(topics)} topics ===\n")

    return {
        "sentences": sentences,
        "topics": topics
    }
