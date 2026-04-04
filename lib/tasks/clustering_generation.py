"""
Sentence clustering task - groups sentences by semantic similarity using TF-IDF + Agglomerative Clustering.
No LLM required; uses scikit-learn.
"""
from typing import Any

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_distances


def process_clustering_generation(
    submission: dict[str, Any], db: Any, llm: Any  # noqa: ARG001
) -> None:
    sentences: list[str] = submission["results"].get("sentences", [])
    topics: list[dict] = submission["results"].get("topics", [])
    submission_id: str = submission["submission_id"]

    if len(sentences) < 2:
        db.submissions.update_one(
            {"submission_id": submission_id},
            {"$set": {"results.clusters": []}},
        )
        return

    vectorizer = TfidfVectorizer(
        max_features=5000,
        stop_words="english",
        ngram_range=(1, 2),
    )
    tfidf_matrix = vectorizer.fit_transform(sentences)
    feature_names = vectorizer.get_feature_names_out()

    k = min(max(2, len(sentences) // 10), 20)
    dense = tfidf_matrix.toarray()
    dist_matrix = cosine_distances(dense)
    # Clamp tiny negatives from floating-point imprecision.
    dist_matrix = np.clip(dist_matrix, 0.0, None)

    model = AgglomerativeClustering(
        n_clusters=k,
        metric="precomputed",
        linkage="average",
    )
    labels = model.fit_predict(dist_matrix)

    # Build topic sentence index lookup (1-based -> topic names).
    sentence_to_topics: dict[int, list[str]] = {}
    for topic in topics:
        name = topic.get("name", "")
        for idx in topic.get("sentences", []):
            sentence_to_topics.setdefault(idx, []).append(name)

    clusters: list[dict[str, Any]] = []
    for cluster_id in range(k):
        member_mask = labels == cluster_id
        member_indices = np.where(member_mask)[0]  # 0-based

        # Extract top keywords from average TF-IDF vector of members.
        avg_vec = dense[member_indices].mean(axis=0)
        top_k_indices = avg_vec.argsort()[::-1][:5]
        keywords = [feature_names[i] for i in top_k_indices if avg_vec[i] > 0]

        # 1-based sentence indices.
        sentence_indices_1based = sorted(int(i) + 1 for i in member_indices)

        overlapping_topics: list[str] = []
        seen: set[str] = set()
        for idx in sentence_indices_1based:
            for topic_name in sentence_to_topics.get(idx, []):
                if topic_name not in seen:
                    seen.add(topic_name)
                    overlapping_topics.append(topic_name)

        clusters.append(
            {
                "cluster_id": cluster_id,
                "keywords": keywords,
                "sentence_indices": sentence_indices_1based,
                "sentence_count": len(sentence_indices_1based),
                "overlapping_topics": overlapping_topics,
            }
        )

    # Sort clusters by size descending for easier reading.
    clusters.sort(key=lambda c: c["sentence_count"], reverse=True)

    db.submissions.update_one(
        {"submission_id": submission_id},
        {"$set": {"results.clusters": clusters}},
    )
