from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from handlers import topics_handler, themed_topic_handler, submission_handler, task_queue_handler
from pymongo import MongoClient
from lib.storage.posts import PostsStorage
from lib.storage.submissions import SubmissionsStorage

app = FastAPI(title="My FastAPI App", description="A simple FastAPI application with separate handlers")

# Allow extension/background fetches (OPTIONS preflight for JSON POST).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

app.include_router(topics_handler.router, prefix="/api")
app.include_router(themed_topic_handler.router, prefix="/api")
app.include_router(submission_handler.router, prefix="/api")
app.include_router(task_queue_handler.router, prefix="/api")

import os
mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:8765/")

print(f"MONGODB_URL: {mongodb_url}")

client = MongoClient(mongodb_url)
posts_storage = PostsStorage(client["rss"])
posts_storage.prepare()
submissions_storage = SubmissionsStorage(client["rss"])
submissions_storage.prepare()
app.state.posts_storage = posts_storage
app.state.submissions_storage = submissions_storage

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

@app.get("/page/tasks")
def serve_tasks_page():
    return FileResponse("frontend/build/index.html")

@app.get("/page/texts")
def serve_texts_page():
    return FileResponse("frontend/build/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
