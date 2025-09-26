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
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import normalize
import numpy as np

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

@router.get("/clustered-post/{tag}")
@router.get("/clustered-post")
def get_clustered_posts(tag: str = None, limit: int = 10, posts_storage: PostsStorage = Depends(get_posts_storage)):
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
    #llm = LLamaCPP("http://192.168.178.26:9876")
    llm = LLamaCPP("http://127.0.0.1:8989")
    for article in articles:
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', article.strip())
        sentences = [s.strip() for s in sentences if s.strip()]

        if not sentences:
            continue

        # Get embeddings for all sentences using LLamaCPP
        emb_senteces = [f"task: clustering | query: {snt}" for snt in sentences]
        embeddings = llm.embeddings(emb_senteces)

        if not embeddings or len(embeddings) == 0:
            # If embeddings failed, create a single topic with all sentences
            topics = [{
                "name": "no_topic",
                "sentences": list(range(1, len(sentences) + 1))
            }]
        else:
            # Convert embeddings to numpy array
            embeddings_array = np.array(embeddings)

            # Normalize embeddings to unit vectors (L2 normalization)
            embeddings_array = normalize(embeddings_array, norm='l2')

            # Apply DBSCAN clustering
            # eps: maximum distance between two samples for one to be considered as in the neighborhood of the other
            # min_samples: number of samples in a neighborhood for a point to be considered as a core point
            dbscan = DBSCAN(eps=0.2, min_samples=2, metric='cosine')
            cluster_labels = dbscan.fit_predict(embeddings_array)

            # Group sentences by cluster labels
            clusters = {}
            for i, label in enumerate(cluster_labels):
                if label not in clusters:
                    clusters[label] = []
                clusters[label].append(i + 1)  # sentence numbers are 1-indexed

            # Create topics from clusters
            topics = []
            for cluster_id, sentence_nums in clusters.items():
                if cluster_id == -1:
                    # DBSCAN uses -1 for noise/outliers
                    topic_name = "no_topic"
                else:
                    topic_name = f"cluster_{cluster_id}"

                topics.append({
                    "name": normalize_topic(topic_name),
                    "sentences": sorted(sentence_nums)
                })

        results.append({
            "sentences": sentences,
            "topics": topics
        })

    return results
