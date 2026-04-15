"""
Standalone LLM worker process.

Supports two execution backends:
- ``local``: claim and complete requests directly in MongoDB.
- ``remote``: claim and complete requests through authenticated HTTP APIs.
"""

import logging
import os
import signal
import threading
import time
from pathlib import Path
from types import FrameType
from typing import Any, Optional, Protocol

import requests
from pymongo import MongoClient
from pymongo.database import Database

from lib.llm import create_llm_client, create_llm_client_from_config
from lib.llm.provider_config import RemoteProviderConfig, load_remote_provider_config
from lib.llm_queue.store import LLMQueueStore
from lib.storage.app_settings import AppSettingsStorage
from lib.storage.llm_cache import MongoLLMCacheStore
from txt_splitt.cache import CacheEntry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

COMPLETED_TASK_RETENTION_HOURS: int = 48
DEFAULT_LEASE_SECONDS: int = 60
DEFAULT_HEARTBEAT_INTERVAL_SECONDS: int = 20


class WorkerBackend(Protocol):
    """Transport for claiming and updating LLM queue requests."""

    def claim(self, worker_id: str) -> Optional[dict[str, Any]]: ...

    def heartbeat(self, request_id: str, worker_id: str, lease_id: str) -> bool: ...

    def complete(
        self,
        request_id: str,
        worker_id: str,
        lease_id: str,
        response: str,
        executed_provider: str,
        executed_model: str,
        executed_model_id: str,
    ) -> bool: ...

    def fail(
        self,
        request_id: str,
        worker_id: str,
        lease_id: str,
        error: str,
    ) -> bool: ...


class LocalQueueBackend:
    """Direct MongoDB-backed queue operations."""

    def __init__(
        self,
        store: LLMQueueStore,
        cache_store: MongoLLMCacheStore,
        *,
        lease_seconds: int,
        supported_model_ids: Optional[list[str]] = None,
    ) -> None:
        self._store = store
        self._cache_store = cache_store
        self._lease_seconds = lease_seconds
        self._supported_model_ids = supported_model_ids

    def claim(self, worker_id: str) -> Optional[dict[str, Any]]:
        return self._store.claim(
            worker_id,
            worker_kind="local",
            lease_seconds=self._lease_seconds,
            supported_model_ids=self._supported_model_ids,
        )

    def heartbeat(self, request_id: str, worker_id: str, lease_id: str) -> bool:
        task = self._store.heartbeat(
            request_id,
            worker_id,
            lease_id,
            lease_seconds=self._lease_seconds,
        )
        return task is not None

    def complete(
        self,
        request_id: str,
        worker_id: str,
        lease_id: str,
        response: str,
        executed_provider: str,
        executed_model: str,
        executed_model_id: str,
    ) -> bool:
        return self._store.complete(
            request_id,
            response,
            worker_id=worker_id,
            lease_id=lease_id,
            executed_provider=executed_provider,
            executed_model=executed_model,
            executed_model_id=executed_model_id,
        )

    def fail(
        self,
        request_id: str,
        worker_id: str,
        lease_id: str,
        error: str,
    ) -> bool:
        return self._store.fail(
            request_id,
            error,
            worker_id=worker_id,
            lease_id=lease_id,
        )

    def write_cache(
        self, request: dict[str, Any], response: str, model_id: str
    ) -> None:
        cache_key = request.get("cache_key")
        if not cache_key:
            return

        self._cache_store.set(
            CacheEntry(
                key=cache_key,
                response=response,
                created_at=time.time(),
                namespace=request.get("cache_namespace") or "",
                model_id=model_id,
                prompt_version=request.get("prompt_version"),
                temperature=float(request.get("temperature", 0.0)),
            )
        )


class RemoteQueueBackend:
    """HTTP-backed queue transport for remote workers."""

    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        timeout_seconds: float = 30.0,
        supported_model_ids: Optional[list[str]] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds
        self._supported_model_ids = supported_model_ids
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
        )

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._session.post(
            f"{self._base_url}{path}",
            json=payload,
            timeout=self._timeout_seconds,
        )
        response.raise_for_status()
        return response.json()

    def claim(self, worker_id: str) -> Optional[dict[str, Any]]:
        payload: dict[str, Any] = {"worker_id": worker_id}
        if self._supported_model_ids:
            payload["supported_model_ids"] = self._supported_model_ids
        response = self._post("/api/llm-workers/claim", payload)
        return response.get("task")

    def heartbeat(self, request_id: str, worker_id: str, lease_id: str) -> bool:
        try:
            self._post(
                f"/api/llm-workers/tasks/{request_id}/heartbeat",
                {"worker_id": worker_id, "lease_id": lease_id},
            )
            return True
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 409:
                return False
            raise

    def complete(
        self,
        request_id: str,
        worker_id: str,
        lease_id: str,
        response: str,
        executed_provider: str,
        executed_model: str,
        executed_model_id: str,
    ) -> bool:
        try:
            self._post(
                f"/api/llm-workers/tasks/{request_id}/complete",
                {
                    "worker_id": worker_id,
                    "lease_id": lease_id,
                    "response": response,
                    "executed_provider": executed_provider,
                    "executed_model": executed_model,
                    "executed_model_id": executed_model_id,
                },
            )
            return True
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 409:
                return False
            raise

    def fail(
        self,
        request_id: str,
        worker_id: str,
        lease_id: str,
        error: str,
    ) -> bool:
        try:
            self._post(
                f"/api/llm-workers/tasks/{request_id}/fail",
                {
                    "worker_id": worker_id,
                    "lease_id": lease_id,
                    "error": error,
                },
            )
            return True
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 409:
                return False
            raise


class HeartbeatLoop:
    """Best-effort lease heartbeating while a task is running."""

    def __init__(
        self,
        backend: WorkerBackend,
        request_id: str,
        worker_id: str,
        lease_id: str,
        *,
        interval_seconds: float,
    ) -> None:
        self._backend = backend
        self._request_id = request_id
        self._worker_id = worker_id
        self._lease_id = lease_id
        self._interval_seconds = interval_seconds
        self._stop_event = threading.Event()
        self._lost_lease = False
        self._thread = threading.Thread(target=self._run, daemon=True)

    @property
    def lost_lease(self) -> bool:
        return self._lost_lease

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._thread.join()

    def _run(self) -> None:
        while not self._stop_event.wait(self._interval_seconds):
            try:
                ok = self._backend.heartbeat(
                    self._request_id,
                    self._worker_id,
                    self._lease_id,
                )
                if not ok:
                    logger.warning(
                        "Worker %s lost lease for request %s during heartbeat",
                        self._worker_id,
                        self._request_id,
                    )
                    self._lost_lease = True
                    self._stop_event.set()
                    return
            except Exception:
                logger.warning(
                    "Heartbeat failed for worker %s request %s",
                    self._worker_id,
                    self._request_id,
                    exc_info=True,
                )


class LLMWorker:
    """Consumes pending requests from the LLM queue and executes them."""

    def __init__(
        self,
        *,
        backend: WorkerBackend,
        db: Database | None = None,
        poll_interval: float = 0.5,
        heartbeat_interval_seconds: float = DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
        heartbeat_file: str | None = None,
        worker_id: str | None = None,
        remote_provider_config: RemoteProviderConfig | None = None,
        register_signal_handlers: bool = True,
    ) -> None:
        self._db = db
        self._backend = backend
        self._poll_interval = poll_interval
        self._heartbeat_interval_seconds = heartbeat_interval_seconds
        self._remote_provider_config = remote_provider_config
        self._worker_id = worker_id or f"llm-worker-{os.getpid()}"
        self._running = True
        self._heartbeat_file = heartbeat_file

        if register_signal_handlers:
            signal.signal(signal.SIGINT, self._handle_stop)
            signal.signal(signal.SIGTERM, self._handle_stop)

    @property
    def worker_id(self) -> str:
        return self._worker_id

    def stop(self) -> None:
        self._running = False

    def _record_heartbeat(self) -> None:
        if self._heartbeat_file:
            try:
                Path(self._heartbeat_file).touch()
            except Exception:
                logger.warning("Failed to record heartbeat at %s", self._heartbeat_file)

    def _handle_stop(self, signum: int, frame: FrameType | None) -> None:  # noqa: ARG002
        logger.info("Worker %s received signal %s, stopping…", self._worker_id, signum)
        self._running = False

    def _get_llm_client(self, request: dict[str, Any]) -> Any:
        requested_provider = request.get("requested_provider")
        requested_model = request.get("requested_model")
        if requested_provider and requested_model:
            if self._remote_provider_config is not None:
                return self._remote_provider_config.create_client(
                    requested_provider,
                    requested_model,
                )
            return create_llm_client_from_config(
                requested_provider, requested_model, db=self._db
            )
        if self._db is None:
            raise RuntimeError(
                "Remote worker cannot resolve legacy queue entry without DB"
            )
        return create_llm_client(db=self._db)

    def run(self) -> None:
        logger.info("LLM worker %s started", self._worker_id)
        while self._running:
            self._record_heartbeat()
            try:
                request = self._backend.claim(self._worker_id)
                if request:
                    self._process(request)
                else:
                    time.sleep(self._poll_interval)
            except Exception:
                logger.exception("Unexpected error in LLM worker loop")
                time.sleep(self._poll_interval)
        logger.info("LLM worker %s stopped", self._worker_id)

    def _process(self, request: dict[str, Any]) -> None:
        request_id = request["request_id"]
        lease_id = request["lease_id"]
        prompt = request["prompt"]
        temperature = float(request.get("temperature", 0.0))
        cache_namespace = request.get("cache_namespace")

        logger.info(
            "Worker %s executing request %s (temp=%.2f, namespace=%s, model=%s)",
            self._worker_id,
            request_id,
            temperature,
            cache_namespace,
            request.get("requested_model_id") or request.get("model_id"),
        )

        heartbeat_loop = HeartbeatLoop(
            self._backend,
            request_id,
            self._worker_id,
            lease_id,
            interval_seconds=self._heartbeat_interval_seconds,
        )
        heartbeat_loop.start()

        try:
            llm = self._get_llm_client(request)
            response = llm.call([prompt], temperature=temperature)
        except Exception as exc:
            heartbeat_loop.stop()
            error_msg = str(exc)
            logger.error(
                "Worker %s failed request %s: %s",
                self._worker_id,
                request_id,
                error_msg,
            )
            failed = self._backend.fail(
                request_id,
                self._worker_id,
                lease_id,
                error_msg,
            )
            if not failed:
                logger.warning(
                    "Worker %s could not fail request %s because the lease was lost",
                    self._worker_id,
                    request_id,
                )
            return

        heartbeat_loop.stop()
        executed_model_id = llm.model_id
        completed = self._backend.complete(
            request_id,
            self._worker_id,
            lease_id,
            response,
            llm.provider_key,
            llm.model_name,
            executed_model_id,
        )
        if not completed:
            logger.warning(
                "Worker %s could not complete request %s because the lease was lost",
                self._worker_id,
                request_id,
            )
            return

        logger.info("Worker %s completed request %s", self._worker_id, request_id)
        if isinstance(self._backend, LocalQueueBackend):
            try:
                self._backend.write_cache(request, response, executed_model_id)
            except Exception:
                logger.warning(
                    "Failed to write cache entry for request %s",
                    request_id,
                    exc_info=True,
                )


def _parse_supported_model_ids(value: str) -> Optional[list[str]]:
    model_ids = [item.strip() for item in value.split(",") if item.strip()]
    return model_ids or None


def main() -> None:
    backend_name = os.getenv("LLM_WORKER_BACKEND", "local").lower()
    poll_interval = float(os.getenv("LLM_WORKER_POLL_INTERVAL", "0.5"))
    heartbeat_file = os.getenv("LLM_WORKER_HEARTBEAT_FILE")
    concurrency = max(1, int(os.getenv("LLM_WORKER_CONCURRENCY", "1")))
    lease_seconds = max(
        10, int(os.getenv("LLM_WORKER_LEASE_SECONDS", str(DEFAULT_LEASE_SECONDS)))
    )
    heartbeat_interval_seconds = float(
        os.getenv(
            "LLM_WORKER_HEARTBEAT_INTERVAL_SECONDS",
            str(min(DEFAULT_HEARTBEAT_INTERVAL_SECONDS, max(1, lease_seconds // 3))),
        )
    )
    supported_model_ids = _parse_supported_model_ids(
        os.getenv("LLM_WORKER_SUPPORTED_MODEL_IDS", "")
    )
    remote_provider_config: RemoteProviderConfig | None = None

    workers: list[LLMWorker]
    client: MongoClient | None = None
    db: Database | None = None

    if backend_name == "local":
        mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:8765/")
        logger.info("Connecting to MongoDB: %s", mongodb_url)
        client = MongoClient(mongodb_url)
        db = client["rss"]

        AppSettingsStorage(db).prepare()
        queue_store = LLMQueueStore(db)
        queue_store.prepare()
        deleted_count = queue_store.cleanup_old(
            max_age_hours=COMPLETED_TASK_RETENTION_HOURS,
            statuses=["completed"],
        )
        if deleted_count:
            logger.info(
                "Removed %s completed LLM queue requests older than %s hours",
                deleted_count,
                COMPLETED_TASK_RETENTION_HOURS,
            )
        reclaimed_count = queue_store.reclaim_stale_processing(
            lease_seconds=lease_seconds
        )
        if reclaimed_count:
            logger.info(
                "Reclaimed %s stale 'processing' LLM queue requests back to 'pending'",
                reclaimed_count,
            )
        cache_store = MongoLLMCacheStore(db)
        cache_store.prepare()

        llm = create_llm_client(db=db)
        logger.info(
            "Initial LLM provider: %s, model: %s", llm.provider_name, llm.model_name
        )

        backend: WorkerBackend = LocalQueueBackend(
            queue_store,
            cache_store,
            lease_seconds=lease_seconds,
            supported_model_ids=supported_model_ids,
        )
    elif backend_name == "remote":
        api_url = os.getenv("LLM_WORKER_API_URL", "").strip()
        token = os.getenv("LLM_WORKER_TOKEN", "").strip()
        provider_config_path = os.getenv("LLM_WORKER_PROVIDER_CONFIG", "").strip()
        if not api_url:
            raise RuntimeError("LLM_WORKER_API_URL is required for remote backend")
        if not token:
            raise RuntimeError("LLM_WORKER_TOKEN is required for remote backend")
        if not provider_config_path:
            raise RuntimeError(
                "LLM_WORKER_PROVIDER_CONFIG is required for remote backend"
            )
        remote_provider_config = load_remote_provider_config(provider_config_path)
        supported_model_ids = remote_provider_config.supported_model_ids
        logger.info(
            "Loaded remote LLM provider config with supported models: %s",
            ", ".join(supported_model_ids),
        )
        backend = RemoteQueueBackend(
            api_url,
            token,
            supported_model_ids=supported_model_ids,
        )
    else:
        raise RuntimeError(f"Unsupported LLM worker backend: {backend_name}")

    worker_prefix = os.getenv("LLM_WORKER_ID") or f"llm-worker-{os.getpid()}"
    workers = [
        LLMWorker(
            backend=backend,
            db=db,
            poll_interval=poll_interval,
            heartbeat_interval_seconds=heartbeat_interval_seconds,
            heartbeat_file=heartbeat_file,
            worker_id=f"{worker_prefix}-{index + 1}"
            if concurrency > 1
            else worker_prefix,
            remote_provider_config=remote_provider_config,
            register_signal_handlers=False,
        )
        for index in range(concurrency)
    ]

    def handle_stop(signum: int, frame: FrameType | None) -> None:  # noqa: ARG001
        logger.info(
            "Received signal %s, stopping %s LLM worker(s)", signum, len(workers)
        )
        for worker in workers:
            worker.stop()

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    try:
        if concurrency == 1:
            workers[0].run()
        else:
            logger.info("Starting %s LLM worker threads", concurrency)
            threads = [
                threading.Thread(target=worker.run, name=worker.worker_id)
                for worker in workers
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt, shutting down")
        for worker in workers:
            worker.stop()
    finally:
        if client is not None:
            client.close()


if __name__ == "__main__":
    main()
