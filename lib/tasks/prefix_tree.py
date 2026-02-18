"""
Prefix tree (compressed radix trie) task - builds a trie of all words in the text.
"""
import re
from collections import defaultdict


def process_prefix_tree(submission, db, llm):
    sentences = submission["results"].get("sentences", [])
    tree = build_compressed_trie(sentences)
    db.submissions.update_one(
        {"submission_id": submission["submission_id"]},
        {"$set": {"results.prefix_tree": tree}}
    )


def build_compressed_trie(sentences):
    # 1. Count words and their sentence positions (1-indexed)
    word_data = defaultdict(lambda: {"count": 0, "sentences": set()})
    for i, sentence in enumerate(sentences, 1):
        words = re.findall(r"[a-zA-Z']+", sentence.lower())
        for word in words:
            word = word.strip("'")
            if word:
                word_data[word]["count"] += 1
                word_data[word]["sentences"].add(i)

    # 2. Build standard character trie
    root = {"children": {}, "count": 0, "sentences": []}
    for word, data in word_data.items():
        node = root
        for ch in word:
            if ch not in node["children"]:
                node["children"][ch] = {"children": {}, "count": 0, "sentences": []}
            node = node["children"][ch]
        node["count"] = data["count"]
        node["sentences"] = sorted(data["sentences"])

    # 3. Compress: merge single-child intermediate nodes
    _compress_node(root)
    return root["children"]


def _compress_node(node):
    """Compress single-child intermediate nodes by merging their labels (in-place)."""
    # Recursively compress all children first
    for child in node["children"].values():
        _compress_node(child)

    # Merge single-child intermediate children by extending their labels
    new_children = {}
    for label, child in node["children"].items():
        current_label = label
        current_child = child
        # Keep merging while current node is a non-word single-child node
        while len(current_child["children"]) == 1 and current_child["count"] == 0:
            child_label, grandchild = next(iter(current_child["children"].items()))
            current_label = current_label + child_label
            current_child = grandchild
        new_children[current_label] = current_child
    node["children"] = new_children
