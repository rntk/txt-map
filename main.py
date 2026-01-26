from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from handlers import sgr_topics_handler, themed_post_handler, clustered_post_handler, topics_handler, themed_topic_handler, mindmap_handler, insides_handler, submission_handler
from pymongo import MongoClient
from lib.storage.posts import PostsStorage
from lib.storage.submissions import SubmissionsStorage
from lib.llm.llamacpp import LLamaCPP

app = FastAPI(title="My FastAPI App", description="A simple FastAPI application with separate handlers")

app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

app.include_router(themed_post_handler.router, prefix="/api")
app.include_router(clustered_post_handler.router, prefix="/api")
app.include_router(sgr_topics_handler.router, prefix="/api")
app.include_router(topics_handler.router, prefix="/api")
app.include_router(themed_topic_handler.router, prefix="/api")
app.include_router(mindmap_handler.router, prefix="/api")
app.include_router(insides_handler.router, prefix="/api")
app.include_router(submission_handler.router, prefix="/api")

import os
mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:8765/")
llamacpp_url = os.getenv("LLAMACPP_URL", "http://localhost:8989")
token = os.getenv("TOKEN")

print(f"MONGODB_URL: {mongodb_url}")
print(f"LLAMACPP_URL: {llamacpp_url}")
if token:
    print(f"TOKEN: {token[:10]}...")
else:
    print("TOKEN: not set")

client = MongoClient(mongodb_url)
posts_storage = PostsStorage(client["rss"])
posts_storage.prepare()
submissions_storage = SubmissionsStorage(client["rss"])
submissions_storage.prepare()
app.state.posts_storage = posts_storage
app.state.submissions_storage = submissions_storage
app.state.llamacpp = LLamaCPP(host=llamacpp_url, token=token)

@app.get("/page/themed-post")
def serve_themed_post_page():
    return FileResponse("frontend/build/index.html")

@app.get("/page/themed-post/{tag}")
def serve_themed_post_page_with_tag(tag: str):
    return FileResponse("frontend/build/index.html")

@app.get("/page/clustered-post")
def serve_clustered_post_page():
    return FileResponse("frontend/build/index.html")

@app.get("/page/clustered-post/{tag}")
def serve_clustered_post_page_with_tag(tag: str):
    return FileResponse("frontend/build/index.html")

@app.get("/page/topics")
def serve_topics_page():
    return FileResponse("frontend/build/index.html")

@app.get("/page/themed-topic")
def serve_themed_topic_page():
    return FileResponse("frontend/build/index.html")

@app.get("/page/themed-topic/{topic}")
def serve_themed_topic_page_with_topic(topic: str):
    return FileResponse("frontend/build/index.html")

@app.get("/page/text/{submission_id}")
def serve_text_page(submission_id: str):
    return FileResponse("frontend/build/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
