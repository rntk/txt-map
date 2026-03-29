"""
Standalone LLM worker process.

Polls the ``llm_queue`` MongoDB collection, claims pending requests,
executes the LLM call with network-level retries, stores the result,
and writes it to the LLM cache if a cache key was provided.

Run one or more instances in parallel:

    python llm_workers.py

Each instance claims work atomically, so running N processes gives
approximately N-times the LLM throughput.
"""

import logging
import os
import signal
import time
from types import FrameType
from typing import Any

from pymongo import MongoClient
from pymongo.database import Database

from lib.llm import create_llm_client
from lib.llm_queue.store import LLMQueueStore
from lib.storage.llm_cache import MongoLLMCacheStore
from lib.storage.app_settings import AppSettingsStorage
from txt_splitt.cache import CacheEntry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


class LLMWorker:
    """Consumes pending requests from the LLM queue and executes them."""

    def __init__(
        self,
        db: Database,
        *,
        poll_interval: float = 0.5,
    ) -> None:
        self._db: Database = db
        self._poll_interval = poll_interval
        self._queue_store = LLMQueueStore(db)
        self._cache_store = MongoLLMCacheStore(db)
        self._worker_id = f"llm-worker-{os.getpid()}"
        self._running = True

        signal.signal(signal.SIGINT, self._handle_stop)
        signal.signal(signal.SIGTERM, self._handle_stop)

    def _handle_stop(self, signum: int, frame: FrameType | None) -> None:  # noqa: ARG002
        logger.info("Worker %s received signal %s, stopping…", self._worker_id, signum)
        self._running = False

    def _get_llm_client(self) -> Any:
        """Create a fresh LLM client (picks up runtime model/provider changes)."""
        return create_llm_client(db=self._db)

    def run(self) -> None:
        """Main poll loop."""
        logger.info("LLM worker %s started", self._worker_id)
        while self._running:
            try:
                request = self._queue_store.claim(self._worker_id)
                if request:
                    self._process(request)
                else:
                    time.sleep(self._poll_interval)
            except Exception:
                logger.exception("Unexpected error in LLM worker loop")
                time.sleep(self._poll_interval)
        logger.info("LLM worker %s stopped", self._worker_id)

    def _process(self, request: dict) -> None:
        request_id: str = request["request_id"]
        prompt: str = request["prompt"]
        temperature: float = float(request.get("temperature", 0.0))
        cache_key: str | None = request.get("cache_key")
        cache_namespace: str | None = request.get("cache_namespace")
        prompt_version: str | None = request.get("prompt_version")

        logger.info(
            "Worker %s executing request %s (temp=%.2f, namespace=%s)",
            self._worker_id, request_id, temperature, cache_namespace,
        )

        try:
            llm = self._get_llm_client()
            # Network-level retries are built into LLMClient.call() via exponential backoff.
            response = llm.call([prompt], temperature=temperature)

            self._queue_store.complete(request_id, response)
            logger.info("Worker %s completed request %s", self._worker_id, request_id)

            # Store in cache so subsequent identical prompts skip the queue.
            if cache_key:
                try:
                    self._cache_store.set(
                        CacheEntry(
                            key=cache_key,
                            response=response,
                            created_at=time.time(),
                            namespace=cache_namespace or "",
                            model_id=llm.model_id,
                            prompt_version=prompt_version,
                            temperature=temperature,
                        )
                    )
                except Exception:
                    logger.warning(
                        "Failed to write cache entry for request %s", request_id, exc_info=True
                    )

        except Exception as exc:
            error_msg = str(exc)
            logger.error(
                "Worker %s failed request %s: %s", self._worker_id, request_id, error_msg
            )
            self._queue_store.fail(request_id, error_msg)


def main() -> None:
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:8765/")
    poll_interval = float(os.getenv("LLM_WORKER_POLL_INTERVAL", "0.5"))

    logger.info("Connecting to MongoDB: %s", mongodb_url)
    client = MongoClient(mongodb_url)
    db = client["rss"]

    # Prepare storage layers.
    AppSettingsStorage(db).prepare()
    queue_store = LLMQueueStore(db)
    queue_store.prepare()
    cache_store = MongoLLMCacheStore(db)
    cache_store.prepare()

    # Log the initial LLM provider so the operator can confirm the right model.
    llm = create_llm_client(db=db)
    logger.info("Initial LLM provider: %s, model: %s", llm.provider_name, llm.model_name)

    worker = LLMWorker(db, poll_interval=poll_interval)
    try:
        worker.run()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt, shutting down")
    finally:
        client.close()


if __name__ == "__main__":
    main()
