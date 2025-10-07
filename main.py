from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from handlers import sgr_topics_handler, themed_post_handler, clustered_post_handler
from pymongo import MongoClient
from lib.storage.posts import PostsStorage

app = FastAPI(title="My FastAPI App", description="A simple FastAPI application with separate handlers")

app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

app.include_router(themed_post_handler.router, prefix="/api")
app.include_router(clustered_post_handler.router, prefix="/api")
app.include_router(sgr_topics_handler.router, prefix="/api")

import os
client = MongoClient(os.getenv("MONGODB_URL", "mongodb://localhost:8765/"))
posts_storage = PostsStorage(client["rss"])
posts_storage.prepare()
app.state.posts_storage = posts_storage

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
