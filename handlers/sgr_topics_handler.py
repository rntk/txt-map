from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
import re
import json
import gzip
import os
import hashlib
import datetime
from lib.llamacpp import LLamaCPP
from lib.html_cleaner import HTMLCleaner
from lib.storage.posts import PostsStorage

class Step(BaseModel):
    topic_summary: str = Field(description="Brief summary of the topic covered in this step")
    key_entities: list[str] = Field(description="List of key entities involved in this step")

class TopicToSencencesMapping(BaseModel):
    topic: str = Field(description="The topic name")
    sentences: list[int] = Field(description="List of sentences indices related to the topic")

class TopicsReasoning(BaseModel):
    steps: list[Step] = Field(description="A list of reasoning steps that lead to the final answer")
    final_answer: list[TopicToSencencesMapping] = Field(description="Mapping of topics to their related sentences")

router = APIRouter()

def get_posts_storage(request: Request) -> PostsStorage:
    return request.app.state.posts_storage

@router.get("/sgr-topics")
@router.get("/sgr-topics/{tag}")
def get_sgr_topics(tag: str = None, limit: int = 10, posts_storage: PostsStorage = Depends(get_posts_storage)):
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
    
    for article in articles:
        # Clean the text
        cleaner = HTMLCleaner()
        cleaner.purge()
        cleaner.feed(article)
        text = " ".join(cleaner.get_content())
        reg = re.compile(r"\s+")
        text = reg.sub(" ", text)
        text = text.strip()
        
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        if not sentences:
            continue
        
        # Join with numbers
        numbered_sentences = [f"{i+1}. {s}" for i, s in enumerate(sentences)]
        numbered_text = '\n'.join(numbered_sentences)
        
        # LLM client
        llm = LLamaCPP("http://192.168.178.26:8989")
        # llm = LLamaCPP("http://127.0.0.1:8989")
        
        schema = TopicsReasoning.model_json_schema()
        schema_str = json.dumps(schema, indent=2)
        
        prompt = f"""
Analyze the following sentences and group them by topic/theme. Provide reasoning steps and final topic mappings.

Output your response as a JSON object with exactly two fields: "steps" and "final_answer".

The "steps" field should be an array of reasoning steps, each with "topic_summary" and "key_entities".
The "final_answer" field should be an array of topic mappings, each with "topic" (string) and "sentences" (array of integers).
Return only the JSON object, no additional text.

Schema reference:
{schema_str}

Sentences:
{numbered_text}
"""
        
        # Call LLM
        print("Calling LLM...\n", prompt)
        try:
            response = llm.call([prompt])
            print("LLM Response:", response)
        except Exception as e:
            print(f"LLM call failed: {e}")
            result = {
                "sentences": sentences,
                "topics": [],
                "reasoning_steps": [{"topic_summary": f"LLM call failed: {str(e)}", "key_entities": []}]
            }
            results.append(result)
            continue
        
        # Try to parse the response as JSON
        try:
            # Try to extract JSON from the response
            response_text = response.strip()
            # Look for JSON object in the response
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start != -1 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                parsed_response = json.loads(json_str)
            else:
                parsed_response = json.loads(response_text)
            
            topics_reasoning = TopicsReasoning(**parsed_response)
            
            # Convert to get_themed_post format
            topics = [{"name": mapping.topic, "sentences": mapping.sentences} for mapping in topics_reasoning.final_answer]
            
            result = {
                "sentences": sentences,
                "topics": topics,
                "reasoning_steps": [{"topic_summary": step.topic_summary, "key_entities": step.key_entities} for step in topics_reasoning.steps]
            }
            results.append(result)
        except (json.JSONDecodeError, ValueError) as e:
            print(f"JSON parsing error: {e}")
            result = {
                "sentences": sentences,
                "topics": [],
                "reasoning_steps": [{"topic_summary": f"Failed to parse LLM response: {str(e)}", "key_entities": []}]
            }
            results.append(result)
    
    return results