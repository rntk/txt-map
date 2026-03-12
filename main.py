from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from handlers import submission_handler, task_queue_handler, diff_handler, llm_cache_handler
from pymongo import MongoClient
from lib.storage.llm_cache import MongoLLMCacheStore
from lib.storage.posts import PostsStorage
from lib.storage.submissions import SubmissionsStorage
from lib.storage.semantic_diffs import SemanticDiffsStorage
from lib.nlp import ensure_nltk_data
from lib.diff.semantic_diff import canonical_pair

ensure_nltk_data()

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
app.include_router(diff_handler.router, prefix="/api")
app.include_router(llm_cache_handler.router, prefix="/api")

import os
mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:8765/")

print(f"MONGODB_URL: {mongodb_url}")

client = MongoClient(mongodb_url)
posts_storage = PostsStorage(client["rss"])
posts_storage.prepare()
submissions_storage = SubmissionsStorage(client["rss"])
submissions_storage.prepare()
semantic_diffs_storage = SemanticDiffsStorage(client["rss"])
semantic_diffs_storage.prepare()
app.state.posts_storage = posts_storage
app.state.submissions_storage = submissions_storage
app.state.semantic_diffs_storage = semantic_diffs_storage
llm_cache_store = MongoLLMCacheStore(client["rss"])
llm_cache_store.prepare()
app.state.llm_cache_store = llm_cache_store


@app.delete("/api/diff")
def delete_diff_data(left_submission_id: str, right_submission_id: str):
    if left_submission_id == right_submission_id:
        raise HTTPException(status_code=400, detail="Please select two different submissions")

    pair_key, submission_a_id, submission_b_id = canonical_pair(left_submission_id, right_submission_id)
    db = app.state.semantic_diffs_storage._db

    deleted_diff_count = db.semantic_diffs.delete_many({"pair_key": pair_key}).deleted_count
    deleted_job_count = db.semantic_diff_jobs.delete_many({"pair_key": pair_key}).deleted_count

    return {
        "deleted": True,
        "pair_key": pair_key,
        "submission_a_id": submission_a_id,
        "submission_b_id": submission_b_id,
        "deleted_diff_count": deleted_diff_count,
        "deleted_job_count": deleted_job_count,
    }


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


@app.get("/page/diff")
def serve_diff_page():
    return FileResponse("frontend/build/index.html")

@app.get("/page/cache")
def serve_cache_page():
    return FileResponse("frontend/build/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
