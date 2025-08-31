from fastapi import APIRouter, Depends, Request
import json
import re
import gzip
import os
from lib.llamacpp import LLamaCPP
from lib.storage.posts import PostsStorage
from lib.html_cleaner import HTMLCleaner

router = APIRouter()

def get_posts_storage(request: Request) -> PostsStorage:
    return request.app.state.posts_storage

@router.get("/themed-post/{tag}")
@router.get("/themed-post")
def get_themed_post(tag: str = None, posts_storage: PostsStorage = Depends(get_posts_storage)):
    user = posts_storage._db.users.find_one()
    if not user:
        return {"error": "No users found"}
    owner = user['sid']
    print(owner, tag)
    if tag:
        posts = list(posts_storage.get_by_tags(owner, [tag]))
    else:
        posts = list(posts_storage.get_all(owner))
    
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
        
        response = llm.call([prompt])
        
        # Parse response
        topics = []
        assigned_sentences = set()
        for line in response.strip().split('\n'):
            if ':' in line:
                topic_name, nums = line.split(':', 1)
                topic_name = topic_name.strip()
                nums = [int(n.strip()) for n in nums.split(',') if n.strip().isdigit()]
                topics.append({"name": topic_name, "sentences": nums})
                assigned_sentences.update(nums)
        
        # Check for unassigned sentences and add to "no_topic"
        total_sentences = len(sentences)
        unassigned = [i+1 for i in range(total_sentences) if i+1 not in assigned_sentences]
        if unassigned:
            # Check if "no_topic" already exists
            no_topic = next((t for t in topics if t["name"] == "no_topic"), None)
            if no_topic:
                no_topic["sentences"].extend(unassigned)
                no_topic["sentences"].sort()
            else:
                topics.append({"name": "no_topic", "sentences": sorted(unassigned)})
        
        results.append({
            "sentences": sentences,
            "topics": topics
        })
    
    return results
