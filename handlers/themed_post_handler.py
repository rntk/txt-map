from fastapi import APIRouter
import json
import re
import os
from lib.llamacpp import LLamaCPP

router = APIRouter()

@router.get("/themed-post")
def get_themed_post():
    post_file = os.path.join(os.path.dirname(__file__), '..', 'post.txt')
    if not os.path.exists(post_file):
        return {"error": "post.txt not found"}
    
    with open(post_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s+', content.strip())
    sentences = [s.strip() for s in sentences if s.strip()]
    
    # Join with numbers
    numbered_sentences = [f"{i+1}. {s}" for i, s in enumerate(sentences)]
    numbered_text = '\n'.join(numbered_sentences)
    
    # LLM client
    llm = LLamaCPP("http://192.168.178.26:8989")
    
    prompt = f"""
Group the following sentences by topic/theme. 
For each topic, write the topic name followed by a colon and the list of sentence numbers separated by commas.

Guidelines for topic naming:
- Keep topics specific but not overly detailed. Prefer more specific terms over general ones (e.g., if sentences mention both "sport" and "hockey", use "hockey" as the topic).
- Use concise topic names that capture the core theme without unnecessary elaboration.
- Aim for 3-7 topics in total, merging similar themes where possible to avoid fragmentation.
- If a sentence doesn't fit any clear topic, group it under 'no_topic'.

Output format:
topic_1: 1,3
topic_2: 2,4
no_topic: 5

Sentences:
{numbered_text}
"""
    
    response = llm.call([prompt])
    
    # Parse response
    topics = []
    assigned_sentences = set()
    for line in response.strip().split('\n'):
        if ':' in line:
            topic_name, nums = line.split(':', 1)
            topic_name = topic_name.strip()
            nums = [int(n.strip()) for n in nums.split(',') if n.strip().isdigit()]
            topics.append({"name": topic_name, "sentences": nums})
            assigned_sentences.update(nums)
    
    # Check for unassigned sentences and add to "no_topic"
    total_sentences = len(sentences)
    unassigned = [i+1 for i in range(total_sentences) if i+1 not in assigned_sentences]
    if unassigned:
        # Check if "no_topic" already exists
        no_topic = next((t for t in topics if t["name"] == "no_topic"), None)
        if no_topic:
            no_topic["sentences"].extend(unassigned)
            no_topic["sentences"].sort()
        else:
            topics.append({"name": "no_topic", "sentences": sorted(unassigned)})
    
    return {
        "sentences": sentences,
        "topics": topics
    }
