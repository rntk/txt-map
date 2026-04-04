import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pymongo import MongoClient

from lib.storage.llm_cache import MongoLLMCacheStore
from lib.storage.posts import PostsStorage
from lib.storage.app_settings import AppSettingsStorage
from lib.storage.submissions import SubmissionsStorage
from lib.storage.semantic_diffs import SemanticDiffsStorage
from lib.storage.task_queue import TaskQueueStorage
from lib.llm_queue.store import LLMQueueStore
from lib.nlp import ensure_nltk_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    auto_download_nltk: bool = os.getenv(
        "NLTK_AUTO_DOWNLOAD_ON_STARTUP", ""
    ).lower() in {
        "1",
        "true",
        "yes",
    }
    ensure_nltk_data(download_missing=auto_download_nltk)

    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:8765/")
    print(f"MONGODB_URL: {mongodb_url}")

    client = MongoClient(mongodb_url)
    db = client["rss"]

    posts_storage = PostsStorage(db)
    posts_storage.prepare()

    submissions_storage = SubmissionsStorage(db)
    submissions_storage.prepare()

    semantic_diffs_storage = SemanticDiffsStorage(db)
    semantic_diffs_storage.prepare()

    llm_cache_store = MongoLLMCacheStore(db)
    llm_cache_store.prepare()

    app_settings_storage = AppSettingsStorage(db)
    app_settings_storage.prepare()

    task_queue_storage = TaskQueueStorage(db)
    llm_queue_store = LLMQueueStore(db)

    app.state.posts_storage = posts_storage
    app.state.submissions_storage = submissions_storage
    app.state.semantic_diffs_storage = semantic_diffs_storage
    app.state.llm_cache_store = llm_cache_store
    app.state.app_settings_storage = app_settings_storage
    app.state.task_queue_storage = task_queue_storage
    app.state.llm_queue_store = llm_queue_store

    yield

    client.close()
