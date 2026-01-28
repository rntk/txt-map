"""
Mindmap generation task - creates mindmap structures for topics
with importance scoring and cross-topic relationships
"""
from lib.storage.submissions import SubmissionsStorage
import hashlib
import datetime
import re


def mark_words_in_sentence(sentence: str):
    """Mark each word with an index marker"""
    words = sentence.split()
    marked_parts = []
    for i, word in enumerate(words):
        marked_parts.append(f"{word} |#{i}#|")
    return " ".join(marked_parts), words


def generate_mindmap_for_topic(topic_name, sentences, sentence_indices, llm, cache_collection):
    """
    Generate a mind map structure for a specific topic based on its sentences.
    Now includes importance scoring (1-5) and node types.
    """
    if not sentences:
        return {}, [], []

    # Combine sentences for the topic and track sentence boundaries in the combined text
    combined_text = ""
    sentence_boundaries = []  # List of (start_word_idx, end_word_idx) for each sentence
    current_word_idx = 0

    for sent in sentences:
        sent_words = sent.split()
        num_words = len(sent_words)
        sentence_boundaries.append((current_word_idx, current_word_idx + num_words - 1))
        if combined_text:
            combined_text += " " + sent
        else:
            combined_text = sent
        current_word_idx += num_words

    marked_text, sentence_words = mark_words_in_sentence(combined_text)

    prompt_template = """You are given a text where every word is followed by a numbered marker |#N#|.
Your task is to extract a mind map structure from this text by identifying the word ranges that represent topics and subtopics.

CRITICAL INSTRUCTIONS FOR BREVITY AND MEANINGFUL EXTRACTION:
- EXTRACT ONLY THE MOST MEANINGFUL KEY TERMS: Focus on the core concepts that define each topic.
- PRIORITIZE BREVITY ABOVE ALL ELSE: Node titles must be as short as possible while retaining meaning.
- IDEAL LENGTH: 1-3 words maximum. Never exceed 4 words unless absolutely necessary for clarity.
- FOCUS ON ESSENTIAL WORDS: Extract only nouns, verbs, and critical modifiers. Eliminate all filler words.
- AVOID REDUNDANCY: Don't repeat words across hierarchy levels. Each level should add new information.
- SELECT THE MOST SPECIFIC TERMS: Choose the most precise and informative words from the text.
- PREFER SINGLE WORD NOUNS: If a concept can be represented by a single noun, use that.
- ELIMINATE CONNECTING WORDS: Remove articles (the, a, an), conjunctions (and, but), prepositions (in, on), etc.
- AVOID ADJECTIVES UNLESS CRITICAL: Only include adjectives if they fundamentally change the meaning.

IMPORTANCE SCORING (1-5):
For each node, assign an importance score:
5 = CRITICAL: Core concept essential to understanding the main topic
4 = IMPORTANT: Key supporting idea or major sub-topic
3 = RELEVANT: Useful detail or explanation
2 = MINOR: Ancillary point or example
1 = INCIDENTAL: Brief mention or tangential information

NODE TYPES:
- concept: Core idea or abstract notion
- entity: Person, organization, product, or named thing
- action: Process, method, or activity
- example: Specific instance or illustration
- attribute: Property, characteristic, or quality
- relationship: Connection between concepts

EXAMPLE OF GOOD EXTRACTION:
Original text: "The |#0#| rapid |#1#| development |#2#| of |#3#| artificial |#4#| intelligence |#5#| technologies |#6#| in |#7#| modern |#8#| healthcare |#9#| systems |#10#|"
Good extraction: "2-2 | 5 | concept" (development) then "4-5 | 5 | concept" (artificial intelligence)
Bad extraction: "0-10 | 3 | concept" (the rapid development of artificial intelligence technologies in modern healthcare systems)

Return a hierarchical list of word ranges with importance scores and types in the format:
Topic_Range | Importance_Score | Node_Type
Topic_Range, Subtopic_Range | Importance_Score | Node_Type

Format for a range is: start-end
Where 'start' is the marker number of the first word and 'end' is the marker number of the last word (inclusive).

Example Output:
3-3 | 5 | entity
3-3, 8-8 | 4 | relationship
10-12 | 3 | example

<content>
{marked_text}
</content>

Mind map:"""

    prompt = prompt_template.replace("{marked_text}", marked_text)
    prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

    cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})

    if cached_response:
        mindmap_response = cached_response["response"]
    else:
        mindmap_response = llm.call([prompt])
        cache_collection.update_one(
            {"prompt_hash": prompt_hash},
            {"$set": {
                "prompt_hash": prompt_hash,
                "prompt": prompt,
                "response": mindmap_response,
                "created_at": datetime.datetime.now()
            }},
            upsert=True
        )

    # Parse the mindmap response - expect comma-separated ranges with metadata
    mindmap_topics = []
    sentence_to_hierarchies = {}
    node_metadata = {}  # Store importance and type for each node

    for line in mindmap_response.strip().split('\n'):
        line = line.strip()
        if not line:
            continue

        # Parse format: "range1-range2, range3-range4 | importance | type"
        # or just "range1-range2 | importance | type" for single node
        parts = [p.strip() for p in line.split(',')]
        if not parts:
            continue

        current_hierarchy = [topic_name]  # Root of the mindmap is the topic name
        valid_line = True
        line_ranges = []
        current_importance = 3  # Default importance
        current_type = "concept"  # Default type

        for i, part in enumerate(parts):
            # Check if this part has metadata (contains |)
            if '|' in part:
                # Split range from metadata
                range_meta_parts = [p.strip() for p in part.split('|')]
                range_str = range_meta_parts[0]
                
                # Parse importance if provided
                if len(range_meta_parts) >= 2:
                    try:
                        importance_val = int(range_meta_parts[1])
                        current_importance = max(1, min(5, importance_val))  # Clamp to 1-5
                    except ValueError:
                        pass
                
                # Parse type if provided
                if len(range_meta_parts) >= 3:
                    node_type = range_meta_parts[2].lower().strip()
                    valid_types = {'concept', 'entity', 'action', 'example', 'attribute', 'relationship'}
                    if node_type in valid_types:
                        current_type = node_type
            else:
                range_str = part

            # Parse range start-end
            if '-' in range_str:
                # Remove any non-digit/dash chars
                clean_part = "".join(c for c in range_str if c.isdigit() or c == '-')
                range_parts = clean_part.split('-')

                if len(range_parts) == 2 and range_parts[0] and range_parts[1]:
                    try:
                        r_start = int(range_parts[0])
                        r_end = int(range_parts[1])

                        # Validate indices
                        if 0 <= r_start <= r_end < len(sentence_words):
                            # Extract text
                            topic_text = " ".join(sentence_words[r_start:r_end + 1])

                            # Avoid duplicating the parent topic name
                            if topic_text.lower() == (current_hierarchy[-1].lower() if current_hierarchy else ""):
                                continue

                            current_hierarchy.append(topic_text)
                            line_ranges.append((r_start, r_end))
                            
                            # Store metadata for this node
                            node_metadata[topic_text] = {
                                "importance": current_importance,
                                "type": current_type,
                                "range": (r_start, r_end)
                            }
                        else:
                            valid_line = False
                            break
                    except ValueError:
                        valid_line = False
                        break
                else:
                    valid_line = False
                    break
            else:
                valid_line = False
                break

        if valid_line and current_hierarchy:
            mindmap_topics.append({
                "hierarchy": current_hierarchy,
                "importance": current_importance,
                "type": current_type
            })
            # Find which sentences this hierarchy belongs to
            for r_start, r_end in line_ranges:
                for i, (s_start, s_end) in enumerate(sentence_boundaries):
                    # Check for overlap
                    if max(r_start, s_start) <= min(r_end, s_end):
                        orig_idx = sentence_indices[i]
                        if orig_idx not in sentence_to_hierarchies:
                            sentence_to_hierarchies[orig_idx] = []
                        hierarchy_entry = {
                            "path": current_hierarchy,
                            "importance": current_importance,
                            "type": current_type
                        }
                        # Avoid duplicates
                        if hierarchy_entry not in sentence_to_hierarchies[orig_idx]:
                            sentence_to_hierarchies[orig_idx].append(hierarchy_entry)

    # Build the hierarchical structure under topic_name with metadata
    structure = {}
    def add_to_structure(struct, hierarchy, importance, node_type, metadata_dict):
        if not hierarchy:
            return
        node = hierarchy[0]
        if node not in struct:
            struct[node] = {
                "children": {},
                "importance": importance,
                "type": node_type,
                "metadata": metadata_dict.get(node, {"importance": importance, "type": node_type})
            }
        if len(hierarchy) > 1:
            add_to_structure(
                struct[node]["children"], 
                hierarchy[1:], 
                importance, 
                node_type,
                metadata_dict
            )

    for entry in mindmap_topics:
        # Skip the first level (topic_name) because it's already the key
        hierarchy = entry["hierarchy"][1:]
        if hierarchy:
            add_to_structure(
                structure, 
                hierarchy, 
                entry["importance"], 
                entry["type"],
                node_metadata
            )

    # Build mindmap_results format for this topic
    mindmap_results = []
    for i, orig_idx in enumerate(sentence_indices):
        hierarchies = sentence_to_hierarchies.get(orig_idx, [])
        if not hierarchies:
            hierarchies = [{"path": [topic_name], "importance": 5, "type": "concept"}]
        
        mindmap_results.append({
            "sentence_index": orig_idx,
            "sentence": sentences[i],
            "mindmap_topics": [h["path"] for h in hierarchies],
            "topic_metadata": [{"importance": h["importance"], "type": h["type"]} for h in hierarchies]
        })

    return structure, mindmap_results, node_metadata


def extract_cross_topic_relationships(topics, topic_mindmaps, llm, cache_collection):
    """
    Extract relationships between different topics in the mindmap.
    Returns a list of relationship dictionaries.
    """
    if len(topics) < 2:
        return []

    # Build a summary of all topics and their key nodes
    topic_summaries = []
    for topic_name, structure in topic_mindmaps.items():
        key_nodes = []
        
        def collect_nodes(struct, prefix=""):
            for node_name, node_data in struct.items():
                if isinstance(node_data, dict):
                    node_info = f"{prefix}{node_name}"
                    key_nodes.append(node_info)
                    if "children" in node_data:
                        collect_nodes(node_data["children"], prefix + "  > ")
        
        collect_nodes(structure)
        topic_summaries.append(f"Topic: {topic_name}\nKey nodes:\n" + "\n".join(key_nodes[:10]))

    prompt_template = """Analyze the following topics and identify cross-topic relationships.
For each relationship, specify:
- Source topic/node
- Relationship type
- Target topic/node
- Brief description of the connection

Relationship types:
- extends: Source expands upon or elaborates target
- example_of: Source is a specific instance of target  
- contrasts_with: Source differs from or opposes target
- supports: Source provides evidence or backing for target
- prerequisite: Source is required to understand target
- related_to: General connection between topics

Topics:
{topics_summary}

Return relationships in this format (one per line):
Source | Relationship | Target | Description

Example:
Machine Learning | extends | Artificial Intelligence | ML is a subset of AI
Neural Networks | example_of | Deep Learning | NNs are a technique in DL

Relationships:"""

    topics_summary = "\n\n".join(topic_summaries)
    prompt = prompt_template.replace("{topics_summary}", topics_summary)
    prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

    cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})

    if cached_response:
        response = cached_response["response"]
    else:
        response = llm.call([prompt])
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

    # Parse relationships
    relationships = []
    for line in response.strip().split('\n'):
        line = line.strip()
        if not line or '|' not in line:
            continue
        
        parts = [p.strip() for p in line.split('|')]
        if len(parts) >= 3:
            relationships.append({
                "source": parts[0],
                "relationship": parts[1].lower().replace(' ', '_'),
                "target": parts[2],
                "description": parts[3] if len(parts) > 3 else ""
            })

    return relationships


def flatten_structure(structure, parent_path=None):
    """
    Flatten the nested structure for easier UI consumption.
    Returns a list of all nodes with their paths and metadata.
    """
    if parent_path is None:
        parent_path = []
    
    nodes = []
    for node_name, node_data in structure.items():
        if isinstance(node_data, dict):
            current_path = parent_path + [node_name]
            node_entry = {
                "name": node_name,
                "path": current_path,
                "importance": node_data.get("importance", 3),
                "type": node_data.get("type", "concept"),
                "has_children": bool(node_data.get("children", {}))
            }
            nodes.append(node_entry)
            
            # Recursively add children
            if "children" in node_data:
                nodes.extend(flatten_structure(node_data["children"], current_path))
    
    return nodes


def process_mindmap(submission: dict, db, llm):
    """
    Process mindmap generation task for a submission.
    Now includes importance scoring and cross-topic relationships.

    Args:
        submission: Submission document from DB
        db: MongoDB database instance
        llm: LLamaCPP client instance
    """
    submission_id = submission["submission_id"]
    results = submission.get("results", {})

    sentences = results.get("sentences", [])
    topics = results.get("topics", [])

    if not topics or not sentences:
        raise ValueError("Topic extraction must be completed first")

    # Ensure LLM cache collection exists
    cache_collection = db.llm_cache
    if "llm_cache" not in db.list_collection_names():
        db.create_collection("llm_cache")
        try:
            db.llm_cache.create_index("prompt_hash", unique=True)
        except:
            pass

    topic_mindmaps = {}
    all_mindmap_results = []
    all_node_metadata = {}

    print(f"Generating mindmaps for {len(topics)} topics")

    for topic in topics:
        if topic["sentences"] and topic["name"] != "no_topic":
            topic_sentences_text = [
                sentences[idx - 1] for idx in topic["sentences"]
                if 0 <= idx - 1 < len(sentences)
            ]

            if topic_sentences_text:
                structure, mindmap_results, node_metadata = generate_mindmap_for_topic(
                    topic["name"],
                    topic_sentences_text,
                    topic["sentences"],
                    llm,
                    cache_collection
                )
                topic_mindmaps[topic["name"]] = structure
                all_mindmap_results.extend(mindmap_results)
                all_node_metadata.update(node_metadata)

    # Extract cross-topic relationships
    print(f"Extracting cross-topic relationships")
    relationships = extract_cross_topic_relationships(
        topics, topic_mindmaps, llm, cache_collection
    )

    # Create flattened node list for easy filtering
    all_nodes = []
    for topic_name, structure in topic_mindmaps.items():
        topic_nodes = flatten_structure(structure)
        for node in topic_nodes:
            node["topic"] = topic_name
        all_nodes.extend(topic_nodes)

    # Calculate statistics
    # Use string keys for MongoDB compatibility (BSON requires string keys)
    importance_distribution = {str(i): 0 for i in range(1, 6)}
    type_distribution = {}
    for node in all_nodes:
        importance_distribution[str(node["importance"])] = importance_distribution.get(str(node["importance"]), 0) + 1
        node_type = node["type"]
        type_distribution[node_type] = type_distribution.get(node_type, 0) + 1

    # Update submission with results
    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(
        submission_id,
        {
            "topic_mindmaps": topic_mindmaps,
            "mindmap_results": all_mindmap_results,
            "mindmap_metadata": {
                "node_count": len(all_nodes),
                "importance_distribution": importance_distribution,
                "type_distribution": type_distribution,
                "all_nodes": all_nodes,
                "cross_topic_relationships": relationships
            }
        }
    )

    print(f"Mindmap generation completed for submission {submission_id}: "
          f"{len(topic_mindmaps)} topic mindmaps, {len(all_nodes)} nodes, "
          f"{len(relationships)} relationships")
