"""
Topic modeling task - discovers latent topics using NMF on TF-IDF sentence vectors.
Maps LLM-assigned topics to latent topics.  No LLM required.
"""

from typing import Any

from sklearn.decomposition import NMF
from sklearn.feature_extraction.text import TfidfVectorizer


def process_topic_modeling_generation(
    submission: dict[str, Any],
    db: Any,
    llm: Any,  # noqa: ARG001
) -> None:
    sentences: list[str] = submission["results"].get("sentences", [])
    topics: list[dict] = submission["results"].get("topics", [])
    submission_id: str = submission["submission_id"]

    if len(sentences) < 2:
        db.submissions.update_one(
            {"submission_id": submission_id},
            {"$set": {"results.topic_model": {}}},
        )
        return

    vectorizer = TfidfVectorizer(
        max_features=5000,
        stop_words="english",
    )
    tfidf_matrix = vectorizer.fit_transform(sentences)
    feature_names = vectorizer.get_feature_names_out()

    n_components = min(max(2, len(topics)), 15)
    nmf = NMF(n_components=n_components, random_state=42, max_iter=500)
    # W: (n_sentences, n_components), H: (n_components, n_features)
    W = nmf.fit_transform(tfidf_matrix)
    H = nmf.components_

    # Normalize topic weights by total activation.
    topic_weights_raw = W.sum(axis=0)
    total = topic_weights_raw.sum()
    topic_weights = (
        (topic_weights_raw / total).tolist() if total > 0 else [0.0] * n_components
    )

    latent_topics: list[dict[str, Any]] = []
    for i in range(n_components):
        top_indices = H[i].argsort()[::-1][:8]
        keywords = [feature_names[j] for j in top_indices if H[i][j] > 0]
        latent_topics.append(
            {
                "id": i,
                "keywords": keywords,
                "weight": round(float(topic_weights[i]), 4),
            }
        )

    # Map each LLM topic to its dominant latent topic(s).
    topic_mapping: list[dict[str, Any]] = []
    for topic in topics:
        name = topic.get("name", "")
        # sentence indices are 1-based; convert to 0-based for W lookup.
        indices_0based = [
            idx - 1 for idx in topic.get("sentences", []) if 1 <= idx <= len(sentences)
        ]
        if not indices_0based:
            topic_mapping.append(
                {"topic_name": name, "latent_topic_ids": [], "scores": []}
            )
            continue

        avg_scores = W[indices_0based].mean(axis=0)
        total_s = avg_scores.sum()
        if total_s > 0:
            avg_scores = avg_scores / total_s

        threshold = 0.1
        matched = [
            (int(i), round(float(avg_scores[i]), 4))
            for i in avg_scores.argsort()[::-1]
            if avg_scores[i] >= threshold
        ]
        topic_mapping.append(
            {
                "topic_name": name,
                "latent_topic_ids": [m[0] for m in matched],
                "scores": [m[1] for m in matched],
            }
        )

    db.submissions.update_one(
        {"submission_id": submission_id},
        {
            "$set": {
                "results.topic_model": {
                    "latent_topics": latent_topics,
                    "topic_mapping": topic_mapping,
                }
            }
        },
    )
