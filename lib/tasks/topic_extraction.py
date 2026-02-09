"""
Topic extraction task - extracts topics from text using sentence tagging approach
"""
from lib.storage.submissions import SubmissionsStorage
import hashlib
import datetime
import re
import logging
from typing import List, Tuple, Dict, Set, Optional


def normalize_topic(topic_name):
    """
    Normalize topic name to avoid duplicates due to case, spaces vs underscores, etc.
    """
    return re.sub(r'[^a-z0-9]+', '_', topic_name.lower()).strip('_')


def generate_subtopics_for_topic(topic_name, sentences, sentence_indices, llm, cache_collection):
    """
    Generate subtopics for a specific chapter/topic.
    
    Args:
        topic_name: Name of the parent topic
        sentences: List of sentence texts for this topic
        sentence_indices: List of sentence indices (1-based) in the original document
        llm: LLamaCPP client instance
        cache_collection: MongoDB cache collection
        
    Returns:
        List of subtopic dictionaries with name, sentences, and parent_topic
    """
    if not sentences or topic_name == "no_topic":
        return []

    numbered_sentences = [f"{sentence_indices[i]}. {sentences[i]}" for i in range(len(sentences))]
    sentences_text = "\n".join(numbered_sentences)

    prompt_template = """Group the following sentences into detailed sub-chapters for the topic "{topic_name}".
- For each sub-chapter, specify which sentences belong to it.
- Output format MUST be exactly:
<subtopic_name>: <comma-separated sentence numbers>

Important instructions:
- Use the exact sentence numbers as provided (e.g., if "15. Some text", use 15).
- Keep sub-chapters specific and meaningful.
- Aim for 2-5 subtopics per chapter.
- If a sentence doesn't fit, assign it to 'no_topic'.

Topic: {topic_name}
Sentences:
{sentences_text}"""

    prompt = prompt_template.replace("{topic_name}", topic_name).replace("{sentences_text}", sentences_text)
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

    subtopics = []
    for line in response.strip().split('\n'):
        if ':' in line:
            name, nums_str = line.split(':', 1)
            name = name.strip()
            # Normalize subtopic name but keep it descriptive
            clean_name = re.sub(r'[^a-zA-Z0-9 ]+', ' ', name).strip()
            nums = [int(n.strip()) for n in nums_str.split(',') if n.strip().isdigit()]
            if nums:
                subtopics.append({
                    "name": clean_name,
                    "sentences": nums,
                    "parent_topic": topic_name
                })
    
    return subtopics


def build_tagged_text(sentences: List[str], start_index: int = 0) -> str:
    """
    Format sentences with {N} markers for LLM prompting.
    """
    formatted = [f"{{{start_index + i}}} {sent}" for i, sent in enumerate(sentences)]
    return "\n".join(formatted)


def parse_range_string(ranges_str: str) -> List[Tuple[int, int]]:
    """Parse range string like '0-5, 10-15, 20' into list of (start, end) tuples."""
    results = []
    parts = [p.strip() for p in ranges_str.split(",")]

    for part in parts:
        if "-" in part and not part.startswith("-"):
            match = re.match(r"(\d+)\s*-\s*(\d+)", part)
            if match:
                results.append((int(match.group(1)), int(match.group(2))))
                continue

        match = re.match(r"(\d+)", part)
        if match:
            n = int(match.group(1))
            results.append((n, n))

    return results


def parse_llm_ranges(response: str) -> List[Tuple[str, int, int]]:
    """
    Parse hierarchical topic paths and sentence ranges from LLM response.
    Expected format: Technology>Database>PostgreSQL: 0-5, 10-15
    """
    lines = [ln.strip() for ln in response.strip().split("\n") if ln.strip()]
    ranges = []

    for ln in lines:
        if ":" not in ln:
            continue

        topic_path, ranges_str = ln.split(":", 1)
        topic_path = topic_path.strip()
        ranges_str = ranges_str.strip()

        # We accept non-hierarchical topics too, though prompt asks for hierarchy
        parsed_ranges = parse_range_string(ranges_str)

        for start_idx, end_idx in parsed_ranges:
            ranges.append((topic_path, start_idx, end_idx))

    return ranges


def normalize_topic_ranges(topic_ranges: List[Tuple[str, int, int]], max_index: int) -> List[Tuple[str, int, int]]:
    """
    Clamp, order, and fill gaps to ensure continuous coverage.
    Uses 0-based sentence indices.
    """
    if not topic_ranges:
        return []

    cleaned = []
    for topic, start, end in topic_ranges:
        start = max(0, min(start, max_index))
        end = max(0, min(end, max_index))
        if start > end:
            start, end = end, start
        cleaned.append((topic, start, end))

    cleaned.sort(key=lambda x: (x[1], x[2]))
    normalized = []
    current = 0

    for topic, start, end in cleaned:
        if end < current:
            continue
        if start > current:
            normalized.append(("no_topic", current, start - 1))
        start = max(start, current)
        normalized.append((topic, start, end))
        current = end + 1
        if current > max_index:
            break

    if current <= max_index:
        normalized.append(("no_topic", current, max_index))

    return normalized


def process_topic_extraction(submission: dict, db, llm):
    """
    Process topic extraction task using sentence tagging approach.

    Args:
        submission: Submission document from DB
        db: MongoDB database instance
        llm: LLamaCPP client instance
    """
    submission_id = submission["submission_id"]
    results = submission.get("results", {})

    sentences = results.get("sentences", [])

    if not sentences:
        raise ValueError("Text splitting must be completed first")

    # 1. Prepare Prompt Template
    # (Using the prompt from PostSplitter)
    prompt_template = """You are analyzing a text presented as numbered sentences.
Sentence numbers are 0-indexed.

Your task: Extract specific, searchable topic keywords for each distinct section of the text.

AGGREGATION REQUIREMENTS (CRITICAL):
These keywords will be grouped across multiple articles. Use CONSISTENT, CANONICAL naming:

Common entities - use these EXACT forms:
- Languages: Python, JavaScript, TypeScript, Go, Rust, Java, C++, C#
- Databases: PostgreSQL, MongoDB, Redis, MySQL, SQLite
- Cloud: AWS, Google Cloud, Azure, Kubernetes, Docker, Terraform
- AI/ML: GPT-4, Claude, Gemini, LLaMA, ChatGPT, AI, ML, Large Language Models
- Frameworks: React, Vue, Angular, Django, FastAPI, Spring Boot, Next.js, NestJS
- Companies: OpenAI, Anthropic, Google, Microsoft, Meta, Apple, Amazon, NVIDIA

Version format: "Name X.Y" (drop patch version)
- ✓ "Python 3.12" (not "Python 3.12.1", "Python version 3.12", "Python v3.12")
- ✓ "React 19" (not "React v19.0", "React 19.0")

When in doubt: use the official product/company name with official capitalization.
KEYWORD SELECTION HIERARCHY (prefer in order):
1. Named entities: specific products, companies, people, technologies
   Examples: "GPT-4", "Kubernetes", "PostgreSQL", "Linus Torvalds"
2. Specific concepts/events: concrete actions, announcements, or occurrences
   Examples: "Series B funding", "CVE-2024-1234 vulnerability", "React 19 release"
3. Technical terms: domain-specific terminology
   Examples: "vector embeddings", "JWT authentication", "HTTP/3 protocol"

HIERARCHICAL TOPIC GRAPH (REQUIRED):
Express each topic as a hierarchical path using ">" separator:
- Use 2-4 levels (avoid too shallow or too deep)
- Top level: General category (Technology, Sport, Politics, Science, Business, Health)
- Middle levels: Sub-categories (AI, Football, Database, Cloud, Security)
- Bottom level: Specific entity or aspect (GPT-4, England, PostgreSQL, AWS)

Examples:
✓ Technology>AI>GPT-4: 0-5
✓ Technology>Database>PostgreSQL: 6-9, 15-17
✓ Sport>Football>England: 10-14
✓ Science>Climate>IPCC Report: 18-20

Invalid formats:
✗ PostgreSQL: 1-5 (too flat - missing category hierarchy)
✗ Tech>Software>DB>SQL>PostgreSQL>Version15: 1-5 (too deep - max 4 levels)

For digest posts with multiple unrelated topics, create separate hierarchies:
Technology>AI>OpenAI: 0-5
Sport>Football>England: 6-10
Politics>Elections>France: 11-15

WHAT MAKES A GOOD KEYWORD:
✓ Helps readers decide if this section is relevant to their interests
✓ Specific enough to distinguish this section from others in the article
✓ Consistent with canonical naming (enables aggregation across articles)
✓ Something a user might search for
✓ 1-5 words (noun phrases preferred)

BAD KEYWORDS (too generic or inconsistent):
✗ "Tech News", "Update", "Information", "Technology", "Discussion", "News"
✗ "Postgres" (use "PostgreSQL"), "JS" (use "JavaScript"), "K8s" (use "Kubernetes")

GOOD KEYWORDS (specific, searchable, and canonical):
✓ "PostgreSQL: indexing" (not "Database Tips", "Postgres indexing")
✓ "Python: asyncio" (not "Programming", "Python async patterns")
✓ "React: hooks" (not "Frontend", "React.js hooks")
✓ "GPT-4" (not "OpenAI GPT-4", "GPT-4 model")

SEMANTIC DISTINCTIVENESS:
If multiple sections share a theme, differentiate them:
- ✓ "AI: medical imaging" and "AI: drug discovery" (not just "AI" for both)
- ✓ "PostgreSQL: indexing" and "PostgreSQL: replication" (not just "PostgreSQL")

SPECIFICITY BALANCE:
- General topic → use canonical name: "PostgreSQL", "Python", "React"
- Specific aspect → use qualified form: "PostgreSQL: indexing", "Python: asyncio"
- Don't over-specify: "React: hooks" not "React hooks useState optimization patterns"

OUTPUT FORMAT (exactly one hierarchy per line):
CategoryLevel1>CategoryLevel2>...>SpecificTopic: SentenceRanges

SentenceRanges can be:
- Single range: 0-5
- Multiple ranges: 0-5, 10-15, 20-22
- Individual sentences: 0, 2, 5
- Mixed: 0-3, 7, 10-15

Examples:
Technology>Database>PostgreSQL: 0-5, 10-15
Sport>Football>England: 2, 4, 6-9

SENTENCE RULES:
- Sentence numbers are 0-indexed
- Every sentence must belong to exactly one keyword group
- Be granular: separate distinct stories/topics into their own keyword groups

<grid>
{tagged_text}
</grid>

Output:"""

    # Ensure LLM cache collection exists
    cache_collection = db.llm_cache
    if "llm_cache" not in db.list_collection_names():
        db.create_collection("llm_cache")
        try:
            db.llm_cache.create_index("prompt_hash", unique=True)
        except:
            pass

    # Token/Chunking Estimation
    try:
        context_size = getattr(llm, "context_size", getattr(llm, "_LLamaCPP__max_context_tokens", 64000))
    except Exception:
        context_size = 64000

    # Calculate static part of the prompt
    # We remove the placeholder to get accurate static size
    template_tokens = llm.estimate_tokens(prompt_template.replace("{tagged_text}", ""))
    # Reserve buffer for output and safety (1500 tokens)
    max_chunk_tokens = context_size - template_tokens - 1500

    print(f"DEBUG: Context size: {context_size}, Template tokens: {template_tokens}, Max chunk tokens: {max_chunk_tokens}")

    chunks = []
    current_chunk = []
    current_tokens = 0
    current_start_idx = 0
    
    # Pre-calculate tokens for each sentence to build optimal chunks
    for i, sent in enumerate(sentences):
        # Format like: {N} Sentence text
        line = f"{{{i}}} {sent}"
        # Estimate +1 for newline character in join
        line_tokens = llm.estimate_tokens(line) + 1
        
        # If adding this line exceeds the chunk limit, finalize current chunk
        if current_tokens + line_tokens > max_chunk_tokens and current_chunk:
            chunks.append({
                "sentences": current_chunk,
                "start_idx": current_start_idx
            })
            print(f"DEBUG: Created chunk starting at {current_start_idx} with {len(current_chunk)} sentences ({current_tokens} tokens)")
            # Reset for next chunk
            current_chunk = []
            current_tokens = 0
            current_start_idx = i
            
        current_chunk.append(sent)
        current_tokens += line_tokens
        
    # Add final chunk
    if current_chunk:
        chunks.append({
            "sentences": current_chunk,
            "start_idx": current_start_idx
        })
        print(f"DEBUG: Created final chunk starting at {current_start_idx} with {len(current_chunk)} sentences ({current_tokens} tokens)")

    # Process all chunks
    all_topic_ranges = []
    
    for chunk_idx, chunk in enumerate(chunks):
        chunk_sentences = chunk["sentences"]
        start_idx = chunk["start_idx"]
        
        print(f"Processing chunk {chunk_idx + 1}/{len(chunks)} (Indices {start_idx}-{start_idx + len(chunk_sentences) - 1})...")

        # 1. Build Tagged Text for this chunk
        tagged_text = build_tagged_text(chunk_sentences, start_index=start_idx)
        
        # 2. Prepare Prompt
        prompt = prompt_template.replace("{tagged_text}", tagged_text)
        prompt_hash = hashlib.md5(prompt.encode()).hexdigest()

        cached_response = cache_collection.find_one({"prompt_hash": prompt_hash})

        if cached_response:
            response = cached_response["response"]
            print(f"  Using cached response for chunk {chunk_idx + 1}")
        else:
            print(f"  Calling LLM for chunk {chunk_idx + 1}")
            try:
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
            except Exception as e:
                print(f"  Error calling LLM for chunk {chunk_idx + 1}: {e}")
                response = ""

        # 3. Parse Ranges
        chunk_ranges = parse_llm_ranges(response)
        all_topic_ranges.extend(chunk_ranges)

    if not all_topic_ranges:
        print(f"No topics found for submission {submission_id}")

    # 4. Normalize (Global)
    # This handles clamping, overlaps cleanup, and gap filling across all chunks
    normalized_ranges = normalize_topic_ranges(all_topic_ranges, len(sentences) - 1)

    # 5. Convert to Topics List
    # Map back to 1-based indices and grouping structure
    final_topics = {}
    
    for topic, start, end in normalized_ranges:
        # Convert 0-based range [start, end] to 1-based list of indices
        sent_indices = list(range(start + 1, end + 2))
        
        if topic not in final_topics:
            final_topics[topic] = []
        final_topics[topic].extend(sent_indices)

    topics_list = []
    for name, sent_indices in final_topics.items():
        # Clean name slightly if needed, though PostSplitter enforces canonical names
        clean_name = name.strip()
        unique_indices = sorted(list(set(sent_indices)))
        if unique_indices:
            topics_list.append({
                "name": clean_name,
                "sentences": unique_indices
            })

    # 6. Generate subtopics
    all_subtopics = []
    
    for topic in topics_list:
        if topic["sentences"] and topic["name"] != "no_topic":
            # Get the actual sentence texts for this topic
            topic_sentences = [sentences[idx - 1] for idx in topic["sentences"]]
            
            # Use just the last part of the hierarchy for the subtopic prompt 
            # or the full path? The original code used normalize_topic(name).
            # The prompt in generate_subtopics_for_topic uses existing name. 
            
            subtopics = generate_subtopics_for_topic(
                topic["name"], 
                topic_sentences, 
                topic["sentences"], 
                llm, 
                cache_collection
            )
            all_subtopics.extend(subtopics)
            print(f"  Generated {len(subtopics)} subtopics for topic '{topic['name']}'")

    # 7. Update submission
    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(
        submission_id,
        {
            "topics": topics_list,
            "sentences": sentences, # Ensure sentences are saved
            "subtopics": all_subtopics
        }
    )

    print(f"Topic extraction completed for submission {submission_id}: {len(topics_list)} topics, {len(all_subtopics)} subtopics")
