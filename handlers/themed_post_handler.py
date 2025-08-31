from fastapi import APIRouter
import json
import re
import os
from lib.llamacpp import LLamaCPP

router = APIRouter()

@router.get("/themed-post")
def get_themed_post():
    # Read post.txt file
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
    
    prompt = f"""Group the following sentences by topic/theme. For each topic, write the topic name followed by a colon and the list of sentence numbers separated by commas.

Sentences:
{numbered_text}

Output format:
topic_1: 1,3
topic_2: 2,4
"""
    
    response = llm.call([prompt])
    
    # Parse response
    topics = []
    for line in response.strip().split('\n'):
        if ':' in line:
            topic_name, nums = line.split(':', 1)
            topic_name = topic_name.strip()
            nums = [int(n.strip()) for n in nums.split(',') if n.strip().isdigit()]
            topics.append({"name": topic_name, "sentences": nums})
    
    return {
        "sentences": sentences,
        "topics": topics
    }
