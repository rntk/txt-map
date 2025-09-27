from fastapi import APIRouter, Depends, Request
import json
import re
import gzip
import os
import hashlib
import datetime
from lib.llamacpp import LLamaCPP
from lib.storage.posts import PostsStorage
from lib.html_cleaner import HTMLCleaner

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

        focus = f"Focus on the theme '{tag}' when grouping the sentences. \n" if tag else ""
        prompt = f"""
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

{focus}But do not ignore other potential themes.

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
