from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from handlers import submission_handler, task_queue_handler
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

frontend_build_dir = Path("frontend/build")
legacy_static_dir = frontend_build_dir / "static"
vite_assets_dir = frontend_build_dir / "assets"

# Support both legacy CRA output (`build/static`) and Vite output (`build/assets`).
if legacy_static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(legacy_static_dir)), name="static")
if vite_assets_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=str(vite_assets_dir)), name="assets")

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

@app.get("/")
def serve_root_page():
    return FileResponse("frontend/build/index.html")

@app.get("/page/menu")
def serve_menu_page():
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
