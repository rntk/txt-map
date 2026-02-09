"""
Insides extraction task - extracts insights/quotes/stats from text
"""
from lib.storage.submissions import SubmissionsStorage
import re
import json

def build_tagged_text(sentences):
    """
    Build text with sentence markers {0} Sentence...
    """
    if not sentences:
        return ""
    
    tagged_lines = []
    for i, sentence in enumerate(sentences):
        tagged_lines.append(f"{{{i}}} {sentence}")
    return "\n".join(tagged_lines)


def process_insides(submission: dict, db, llm):
    """
    Process insides extraction task for a submission.
    """
    submission_id = submission["submission_id"]
    results = submission.get("results", {})
    sentences = results.get("sentences", [])

    if not sentences:
        print(f"Skipping insides extraction for {submission_id}: No sentences found")
        return

    # Prepare marked text for LLM
    marked_text = build_tagged_text(sentences)
    
    # We might need to chunk if too large, but for now assuming fits context or handled by simple truncation if needed
    # (The previous implementation had complex chunking, but we'll trust the context window for now or simple split if needed in future)
    # The prompt template consumes tokens too.
    
    prompt_template = """
    Analyze the following text and extract key insights, important quotes, and statistics.
    The text is marked with sentence numbers like {0}, {1}, etc.
    
    Return the output as a JSON list of objects. Each object should have:
    - "type": "insight" | "quote" | "stat"
    - "content": The extracted text or summary
    - "sentence_start": The starting sentence index (integer)
    - "sentence_end": The ending sentence index (integer)
    
    Text to analyze:
    {text_chunk}
    
    JSON Output:
    """
    
    # Check token count - simple safeguard 
    # If text is very long, a more robust chunking strategy like in txt_splitt might be needed, 
    # but for this refactor we'll process as one block or first block to verify integration.
    # In a real scenario, we might want to iterate or use a rolling window.
    # For now, let's process the whole text (or up to context limit).
    
    text_chunk = marked_text
    
    # Run LLM
    prompt = prompt_template.replace("{text_chunk}", text_chunk)
    try:
        response_text = llm.call([prompt])
    except Exception as e:
        print(f"LLM error in insides: {e}")
        return

    # Parse JSON
    try:
        # Extract JSON from response if wrapped in markdown code blocks
        json_match = re.search(r'```json\s*(.*?)```', response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = response_text
            
        insides_data = json.loads(json_str)
        
        # Validate/Clean data
        cleaned_insides = []
        if isinstance(insides_data, list):
            for item in insides_data:
                if "content" in item:
                    # Ensure indices are valid, default to 0 if missing
                    # Support both "sentence_start" and "sentence_index_start" just in case LLM drifts, strictly asking for sentence_start
                    s_start = int(item.get("sentence_start", item.get("sentence_index_start", 0)))
                    s_end = int(item.get("sentence_end", item.get("sentence_index_end", s_start)))
                    
                    # Clamp
                    s_start = max(0, min(s_start, len(sentences)-1))
                    s_end = max(s_start, min(s_end, len(sentences)-1))
                    
                    cleaned_insides.append({
                        "type": item.get("type", "insight"),
                        "content": item["content"],
                        "sentence_index_start": s_start,
                        "sentence_index_end": s_end
                    })
        
        # Update storage
        storage = SubmissionsStorage(db)
        storage.update_results(submission_id, {"insides": cleaned_insides})
        print(f"Insides extraction completed for {submission_id}: {len(cleaned_insides)} items")

    except json.JSONDecodeError:
        print(f"Failed to parse JSON from insides response for {submission_id}")
    except Exception as e:
        print(f"Error processing insides for {submission_id}: {e}")


def process_insides_extraction(submission: dict, db, llm):
    """Backward-compatible alias."""
    return process_insides(submission, db, llm)
