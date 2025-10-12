from fastapi import APIRouter, Depends, Request
from urllib.parse import unquote
import html
from typing import Optional, List, Dict, Any
from lib.storage.posts import PostsStorage

router = APIRouter()


def get_posts_storage(request: Request) -> PostsStorage:
    return request.app.state.posts_storage


@router.get("/themed-topic/{topic}")
@router.get("/themed-topic")
def get_themed_topic(topic: Optional[str] = None, limit: int = 10, posts_storage: PostsStorage = Depends(get_posts_storage)) -> List[Dict[str, Any]]:
    """
    Return list of posts with topics from DB (collection: post_topics).
    The format matches /themed-post: each item is { "sentences": [str], "topics": [{"name": str, "sentences": [int]}] }.
    If {topic} is provided, only topics (and posts containing them) matching the given topic name are returned.
    No LLM calls are performed here.
    """
    db = posts_storage._db

    # Decode/unescape topic if provided
    if topic is not None:
        topic = html.unescape(unquote(topic))

    user = db.users.find_one()
    if not user:
        return []
    owner = user["sid"]

    query: Dict[str, Any] = {"owner": owner}
    if topic:
        # Only documents containing the topic
        query["topics.name"] = topic

    projection = {"_id": 0, "sentences": 1, "topics": 1}

    docs = list(db.post_topics.find(query, projection).limit(limit))


    # Ensure default structure even if fields are missing
    results: List[Dict[str, Any]] = []
    for d in docs:
        sentences = d.get("sentences") or []
        topics = d.get("topics") or []
        results.append({"sentences": sentences, "topics": topics})

    return results
