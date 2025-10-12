from fastapi import APIRouter, Depends, Request
from typing import Optional
from lib.storage.posts import PostsStorage

router = APIRouter()


def get_posts_storage(request: Request) -> PostsStorage:
    return request.app.state.posts_storage


@router.get("/topics")
def get_topics(limit: int = 100, skip: int = 0, posts_storage: PostsStorage = Depends(get_posts_storage)):
    """
    Return list of topics aggregated from DB (collection: post_topics).
    Each item: { name, totalPosts, totalSentences }
    """
    db = posts_storage._db

    user = db.users.find_one()
    if not user:
        return []
    owner = user["sid"]

    pipeline = [
        {"$match": {"owner": owner}},
        {"$unwind": "$topics"},
        {
            "$group": {
                "_id": "$topics.name",
                "post_ids": {"$addToSet": "$post_id"},
                "totalSentences": {"$sum": {"$size": "$topics.sentences"}},
            }
        },
        {
            "$project": {
                "_id": 0,
                "name": "$_id",
                "totalPosts": {"$size": "$post_ids"},
                "totalSentences": 1,
            }
        },
        {"$sort": {"totalPosts": -1, "totalSentences": -1, "name": 1}},
        {"$skip": skip},
        {"$limit": limit},
    ]

    topics = list(db.post_topics.aggregate(pipeline))
    return topics
