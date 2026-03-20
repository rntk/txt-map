from __future__ import annotations

from datetime import datetime, UTC
from typing import Dict, List, Tuple, Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


ALGORITHM_VERSION = "semantic-v3-topic-aware-charwb-3-6-th0.25-cr0.5-topk-shared"


def canonical_pair(left_submission_id: str, right_submission_id: str) -> Tuple[str, str, str]:
    """Return pair key and canonical IDs for an unordered pair."""
    submission_a_id, submission_b_id = sorted([left_submission_id, right_submission_id])
    pair_key = f"{submission_a_id}::{submission_b_id}"
    return pair_key, submission_a_id, submission_b_id


def _parse_sentence_indices_from_topic(topic: Dict[str, Any]) -> List[int]:
    """Extract 0-based sentence indices from topic.ranges/topic.sentences."""
    result: set[int] = set()

    ranges = topic.get("ranges") or []
    for entry in ranges:
        if not isinstance(entry, dict):
            continue
        start = entry.get("sentence_start")
        end = entry.get("sentence_end")
        if start is None and end is None:
            continue
        if start is None:
            start = end
        if end is None:
            end = start
        if not isinstance(start, int) or not isinstance(end, int):
            continue
        lo = min(start, end) - 1
        hi = max(start, end) - 1
        for idx in range(lo, hi + 1):
            if idx >= 0:
                result.add(idx)

    for idx in topic.get("sentences") or []:
        if isinstance(idx, int) and idx > 0:
            result.add(idx - 1)

    return sorted(result)


def build_topic_units(submission: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Build topic-aware sentence units from a submission.

    Returns:
        (units, missing_reasons)
    """
    results = submission.get("results") or {}
    sentences = results.get("sentences") or []
    topics = results.get("topics") or []
    missing: List[str] = []

    if not sentences:
        missing.append("sentences_missing")
        if not topics:
            missing.append("topics_missing")
        return [], missing
    if not topics:
        missing.append("topics_missing")
        return [], missing

    sentence_topics: Dict[int, str] = {}
    any_topic_ranges = False
    for topic in topics:
        if not isinstance(topic, dict):
            continue
        topic_name = str(topic.get("name") or "").strip() or "(untitled)"
        indices = _parse_sentence_indices_from_topic(topic)
        if indices:
            any_topic_ranges = True
        for idx in indices:
            if 0 <= idx < len(sentences) and idx not in sentence_topics:
                sentence_topics[idx] = topic_name

    if not any_topic_ranges:
        missing.append("topic_ranges_missing")
        return [], missing

    units: List[dict] = []
    for idx in sorted(sentence_topics.keys()):
        text = sentences[idx]
        if not isinstance(text, str) or not text.strip():
            continue
        units.append(
            {
                "topic": sentence_topics[idx],
                "sentence_index": idx,
                "text": text.strip(),
            }
        )

    if not units:
        missing.append("topic_units_empty")
    return units, missing


def check_submission_topic_readiness(submission: Dict[str, Any]) -> Dict[str, Any]:
    """Return readiness report for topic-aware diff prerequisites."""
    units, missing = build_topic_units(submission)
    return {"ready": len(missing) == 0, "missing": missing, "unit_count": len(units)}


def _compute_directional(
    source_units: List[Dict[str, Any]],
    target_units: List[Dict[str, Any]],
    *,
    similarity_matrix: np.ndarray | None = None,
    threshold: float,
    nearest_min_similarity: float,
    top_k_nearest: int,
    source_label: str,
    target_label: str,
) -> Dict[str, Any]:
    if not source_units:
        return {
            "matches": [],
            "nearest": [],
            "unmatched_target_indices": list(range(len(target_units))),
        }
    if not target_units:
        return {
            "matches": [
                {
                    f"{source_label}_topic": s["topic"],
                    f"{source_label}_sentence_index": s["sentence_index"],
                    f"{source_label}_text": s["text"],
                    f"{target_label}_topic": None,
                    f"{target_label}_sentence_index": None,
                    f"{target_label}_text": None,
                    "similarity": 0.0,
                }
                for s in source_units
            ],
            "nearest": [],
            "unmatched_target_indices": [],
        }

    if similarity_matrix is None:
        corpus = [u["text"] for u in source_units] + [u["text"] for u in target_units]
        vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 6), lowercase=True)
        tfidf_matrix = vectorizer.fit_transform(corpus)

        source_matrix = tfidf_matrix[: len(source_units)]
        target_matrix = tfidf_matrix[len(source_units) :]
        similarity_matrix = cosine_similarity(source_matrix, target_matrix)

    nearest: List[dict] = []
    matched_target_indices: set[int] = set()

    matches: List[dict] = []
    for source_idx, source_unit in enumerate(source_units):
        row = similarity_matrix[source_idx]
        ranked_indices = [int(idx) for idx in np.argsort(row)[::-1]]
        best_target_idx = ranked_indices[0] if ranked_indices else -1
        best_similarity = float(row[best_target_idx]) if best_target_idx >= 0 else 0.0

        # Single shared ranking approach:
        # 1) rank #1 goes to the center match;
        # 2) ranks #2..#(N+1) populate nearest links.
        for target_idx in ranked_indices[1 : top_k_nearest + 1]:
            similarity = float(row[target_idx])
            if similarity < nearest_min_similarity:
                continue
            target_unit = target_units[target_idx]
            nearest.append(
                {
                    f"{source_label}_topic": source_unit["topic"],
                    f"{source_label}_sentence_index": source_unit["sentence_index"],
                    f"{source_label}_text": source_unit["text"],
                    f"{target_label}_topic": target_unit["topic"],
                    f"{target_label}_sentence_index": target_unit["sentence_index"],
                    f"{target_label}_text": target_unit["text"],
                    "similarity": round(similarity, 4),
                }
            )

        if best_target_idx >= 0 and best_similarity >= threshold:
            matched_target_indices.add(best_target_idx)
            target_unit = target_units[best_target_idx]
            matches.append(
                {
                    f"{source_label}_topic": source_unit["topic"],
                    f"{source_label}_sentence_index": source_unit["sentence_index"],
                    f"{source_label}_text": source_unit["text"],
                    f"{target_label}_topic": target_unit["topic"],
                    f"{target_label}_sentence_index": target_unit["sentence_index"],
                    f"{target_label}_text": target_unit["text"],
                    "similarity": round(best_similarity, 4),
                }
            )
        else:
            matches.append(
                {
                    f"{source_label}_topic": source_unit["topic"],
                    f"{source_label}_sentence_index": source_unit["sentence_index"],
                    f"{source_label}_text": source_unit["text"],
                    f"{target_label}_topic": None,
                    f"{target_label}_sentence_index": None,
                    f"{target_label}_text": None,
                    "similarity": round(best_similarity, 4),
                }
            )

    unmatched_target_indices = [
        idx for idx in range(len(target_units)) if idx not in matched_target_indices
    ]
    return {
        "matches": matches,
        "nearest": nearest,
        "unmatched_target_indices": unmatched_target_indices,
    }


def compute_topic_aware_semantic_diff(
    submission_a: Dict[str, Any],
    submission_b: Dict[str, Any],
    *,
    threshold: float = 0.25,
    nearest_min_similarity: float = 0.5,
    top_k_nearest: int = 3,
) -> Dict[str, Any]:
    units_a, missing_a = build_topic_units(submission_a)
    units_b, missing_b = build_topic_units(submission_b)

    if missing_a or missing_b:
        raise ValueError(
            f"Topic prerequisites are not ready: left={missing_a or []}, right={missing_b or []}"
        )

    similarity_a_to_b: np.ndarray | None = None
    if units_a and units_b:
        corpus = [u["text"] for u in units_a] + [u["text"] for u in units_b]
        vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 6), lowercase=True)
        tfidf_matrix = vectorizer.fit_transform(corpus)
        matrix_a = tfidf_matrix[: len(units_a)]
        matrix_b = tfidf_matrix[len(units_a) :]
        similarity_a_to_b = cosine_similarity(matrix_a, matrix_b)

    a_to_b = _compute_directional(
        units_a,
        units_b,
        similarity_matrix=similarity_a_to_b,
        threshold=threshold,
        nearest_min_similarity=nearest_min_similarity,
        top_k_nearest=top_k_nearest,
        source_label="a",
        target_label="b",
    )
    b_to_a = _compute_directional(
        units_b,
        units_a,
        similarity_matrix=similarity_a_to_b.T if similarity_a_to_b is not None else None,
        threshold=threshold,
        nearest_min_similarity=nearest_min_similarity,
        top_k_nearest=top_k_nearest,
        source_label="b",
        target_label="a",
    )

    unmatched_b = [units_b[idx] for idx in a_to_b["unmatched_target_indices"]]
    unmatched_a = [units_a[idx] for idx in b_to_a["unmatched_target_indices"]]

    return {
        "meta": {
            "algorithm_version": ALGORITHM_VERSION,
            "threshold": threshold,
            "nearest_min_similarity": nearest_min_similarity,
            "top_k_nearest": top_k_nearest,
            "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "units_a": len(units_a),
            "units_b": len(units_b),
            "topics_a": len({u["topic"] for u in units_a}),
            "topics_b": len({u["topic"] for u in units_b}),
        },
        "matches_a_to_b": a_to_b["matches"],
        "matches_b_to_a": b_to_a["matches"],
        "nearest_a_to_b": a_to_b["nearest"],
        "nearest_b_to_a": b_to_a["nearest"],
        "unmatched_a": unmatched_a,
        "unmatched_b": unmatched_b,
    }


def orient_payload(
    payload: Dict[str, Any],
    submission_a_id: str,
    submission_b_id: str,
    left_submission_id: str,
    right_submission_id: str,
) -> Dict[str, Any]:
    """
    Orient canonical A/B payload into requested left/right direction.
    """
    def remap_rows(rows: List[Dict[str, Any]], left_prefix: str, right_prefix: str) -> List[Dict[str, Any]]:
        mapped = []
        for row in rows or []:
            mapped.append(
                {
                    "left_topic": row.get(f"{left_prefix}_topic"),
                    "left_sentence_index": row.get(f"{left_prefix}_sentence_index"),
                    "left_text": row.get(f"{left_prefix}_text"),
                    "right_topic": row.get(f"{right_prefix}_topic"),
                    "right_sentence_index": row.get(f"{right_prefix}_sentence_index"),
                    "right_text": row.get(f"{right_prefix}_text"),
                    "similarity": row.get("similarity"),
                }
            )
        return mapped

    if left_submission_id == submission_a_id and right_submission_id == submission_b_id:
        return {
            "meta": payload.get("meta") or {},
            "matches_left_to_right": remap_rows(payload.get("matches_a_to_b") or [], "a", "b"),
            "matches_right_to_left": remap_rows(payload.get("matches_b_to_a") or [], "a", "b"),
            "nearest_left_to_right": remap_rows(payload.get("nearest_a_to_b") or [], "a", "b"),
            # Keep field semantics stable: left_* is always left doc, right_* is always right doc.
            "nearest_right_to_left": remap_rows(payload.get("nearest_b_to_a") or [], "a", "b"),
            "unmatched_left": payload.get("unmatched_a") or [],
            "unmatched_right": payload.get("unmatched_b") or [],
        }

    return {
        "meta": payload.get("meta") or {},
        "matches_left_to_right": remap_rows(payload.get("matches_b_to_a") or [], "b", "a"),
        "matches_right_to_left": remap_rows(payload.get("matches_a_to_b") or [], "b", "a"),
        "nearest_left_to_right": remap_rows(payload.get("nearest_b_to_a") or [], "b", "a"),
        # Keep field semantics stable: left_* is always left doc, right_* is always right doc.
        "nearest_right_to_left": remap_rows(payload.get("nearest_a_to_b") or [], "b", "a"),
        "unmatched_left": payload.get("unmatched_b") or [],
        "unmatched_right": payload.get("unmatched_a") or [],
    }


def stale_reasons(
    diff_doc: Dict[str, Any],
    submission_a: Dict[str, Any],
    submission_b: Dict[str, Any],
    *,
    algorithm_version: str = ALGORITHM_VERSION,
) -> List[str]:
    reasons: List[str] = []
    if (diff_doc.get("algorithm_version") or "") != algorithm_version:
        reasons.append("algorithm_version_mismatch")

    computed_at = diff_doc.get("computed_at")
    updated_a = submission_a.get("updated_at")
    updated_b = submission_b.get("updated_at")
    if isinstance(computed_at, datetime) and isinstance(updated_a, datetime) and updated_a > computed_at:
        reasons.append("left_submission_updated")
    if isinstance(computed_at, datetime) and isinstance(updated_b, datetime) and updated_b > computed_at:
        reasons.append("right_submission_updated")
    return reasons
