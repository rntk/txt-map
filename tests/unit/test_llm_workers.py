"""Unit tests for llm_workers startup cleanup behavior."""

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from lib.llm_queue.store import LLMQueueStore
from llm_workers import main


class TestLLMQueueStoreCleanupOld:
    """Tests for old LLM queue request cleanup."""

    def test_cleanup_old_uses_completed_and_failed_statuses_by_default(self) -> None:
        """Default cleanup removes completed and failed requests."""
        mock_db = MagicMock()
        store = LLMQueueStore(mock_db)

        with patch("lib.llm_queue.store.datetime") as mock_datetime:
            mock_now = datetime(2026, 4, 1, tzinfo=UTC)
            mock_datetime.now.return_value = mock_now
            mock_db[LLMQueueStore.COLLECTION].delete_many.return_value.deleted_count = 3

            deleted_count = store.cleanup_old()

        assert deleted_count == 3
        delete_filter = mock_db[LLMQueueStore.COLLECTION].delete_many.call_args.args[0]
        assert delete_filter["status"]["$in"] == ["completed", "failed"]
        assert delete_filter["completed_at"]["$lt"] == datetime(2026, 3, 31, tzinfo=UTC)

    def test_cleanup_old_accepts_custom_statuses(self) -> None:
        """Cleanup can target a specific status list."""
        mock_db = MagicMock()
        store = LLMQueueStore(mock_db)

        with patch("lib.llm_queue.store.datetime") as mock_datetime:
            mock_now = datetime(2026, 4, 1, tzinfo=UTC)
            mock_datetime.now.return_value = mock_now
            mock_db[LLMQueueStore.COLLECTION].delete_many.return_value.deleted_count = 1

            store.cleanup_old(max_age_hours=48, statuses=["completed"])

        delete_filter = mock_db[LLMQueueStore.COLLECTION].delete_many.call_args.args[0]
        assert delete_filter["status"]["$in"] == ["completed"]
        assert delete_filter["completed_at"]["$lt"] == datetime(2026, 3, 30, tzinfo=UTC)


class TestLLMWorkersMain:
    """Tests for llm_workers.main."""

    @patch("llm_workers.threading.Thread")
    @patch("llm_workers.logger")
    @patch("llm_workers.LLMWorker")
    @patch("llm_workers.create_llm_client")
    @patch("llm_workers.MongoLLMCacheStore")
    @patch("llm_workers.LLMQueueStore")
    @patch("llm_workers.AppSettingsStorage")
    @patch("llm_workers.MongoClient")
    def test_main_reclaims_stale_processing_on_start(
        self,
        mock_mongo_client: MagicMock,
        mock_app_settings_storage: MagicMock,
        mock_queue_store_cls: MagicMock,
        mock_cache_store_cls: MagicMock,
        mock_create_llm_client: MagicMock,
        mock_worker_cls: MagicMock,
        mock_logger: MagicMock,
        mock_thread_cls: MagicMock,
    ) -> None:
        """Startup reclaims stale processing requests and does not clean up completed."""
        mock_client = MagicMock()
        mock_db = MagicMock()
        mock_client.__getitem__.return_value = mock_db
        mock_mongo_client.return_value = mock_client

        mock_queue_store = MagicMock()
        mock_queue_store.reclaim_stale_processing.return_value = 3
        mock_queue_store_cls.return_value = mock_queue_store

        mock_llm = MagicMock()
        mock_llm.provider_name = "openai"
        mock_llm.model_name = "gpt-test"
        mock_create_llm_client.return_value = mock_llm

        main()

        mock_queue_store.reclaim_stale_processing.assert_called_once()
        mock_queue_store.cleanup_old.assert_not_called()
        mock_worker_cls.return_value.run.assert_called_once_with()
        mock_client.close.assert_called_once_with()
        assert mock_thread_cls.call_count == 1
        assert mock_thread_cls.call_args.kwargs["name"] == "llm-maintenance"

    @patch.dict(os.environ, {"LLM_WORKER_CONCURRENCY": "3"}, clear=False)
    @patch("llm_workers.threading.Thread")
    @patch("llm_workers.signal.signal")
    @patch("llm_workers.logger")
    @patch("llm_workers.LLMWorker")
    @patch("llm_workers.create_llm_client")
    @patch("llm_workers.MongoLLMCacheStore")
    @patch("llm_workers.LLMQueueStore")
    @patch("llm_workers.AppSettingsStorage")
    @patch("llm_workers.MongoClient")
    def test_main_starts_multiple_worker_threads_when_configured(
        self,
        mock_mongo_client: MagicMock,
        mock_app_settings_storage: MagicMock,
        mock_queue_store_cls: MagicMock,
        mock_cache_store_cls: MagicMock,
        mock_create_llm_client: MagicMock,
        mock_worker_cls: MagicMock,
        mock_logger: MagicMock,
        mock_signal: MagicMock,
        mock_thread_cls: MagicMock,
    ) -> None:
        """Startup can fan out multiple in-process LLM workers."""
        mock_client = MagicMock()
        mock_db = MagicMock()
        mock_client.__getitem__.return_value = mock_db
        mock_mongo_client.return_value = mock_client

        mock_queue_store = MagicMock()
        mock_queue_store.reclaim_stale_processing.return_value = 0
        mock_queue_store_cls.return_value = mock_queue_store

        mock_llm = MagicMock()
        mock_llm.provider_name = "openai"
        mock_llm.model_name = "gpt-test"
        mock_create_llm_client.return_value = mock_llm

        thread_instances = [MagicMock(), MagicMock(), MagicMock(), MagicMock()]
        mock_thread_cls.side_effect = thread_instances

        main()

        assert mock_worker_cls.call_count == 3
        for call_args in mock_worker_cls.call_args_list:
            assert call_args.kwargs["register_signal_handlers"] is False
        assert mock_thread_cls.call_count == 4
        # maintenance thread (daemon=True) + 3 worker threads
        mock_thread_cls.assert_any_call(
            target=mock_thread_cls.call_args_list[0].kwargs["target"],
            name="llm-maintenance",
            daemon=True,
        )
        for thread in thread_instances:
            thread.start.assert_called_once_with()
        # join is only called for worker threads
        for thread in thread_instances[1:]:
            thread.join.assert_called_once_with()
        assert mock_signal.call_count == 2
        mock_client.close.assert_called_once_with()

    @patch.dict(
        os.environ,
        {
            "LLM_WORKER_BACKEND": "remote",
            "LLM_WORKER_API_URL": "https://api.example",
            "LLM_WORKER_TOKEN": "worker-token",
        },
        clear=False,
    )
    @patch("llm_workers.signal.signal")
    @patch("llm_workers.LLMWorker")
    @patch("llm_workers.RemoteQueueBackend")
    @patch("llm_workers.MongoClient")
    def test_main_remote_loads_provider_config_and_uses_supported_models(
        self,
        mock_mongo_client: MagicMock,
        mock_remote_backend_cls: MagicMock,
        mock_worker_cls: MagicMock,
        mock_signal: MagicMock,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Remote startup derives claimable model IDs from its provider config."""
        config_path = tmp_path / "llm-providers.json"
        config_path.write_text(
            json.dumps(
                {
                    "providers": [
                        {
                            "id": "custom:abc123",
                            "name": "Remote Llama",
                            "type": "openai_comp",
                            "model": "llama-3.3",
                            "token": "secret",
                            "url": "https://llm.example/v1",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        monkeypatch.setenv("LLM_WORKER_PROVIDER_CONFIG", str(config_path))

        main()

        mock_mongo_client.assert_not_called()
        mock_remote_backend_cls.assert_called_once_with(
            "https://api.example",
            "worker-token",
            supported_model_ids=["custom:abc123:llama-3.3"],
        )
        assert mock_worker_cls.call_args.kwargs["remote_provider_config"] is not None
        mock_worker_cls.return_value.run.assert_called_once_with()
        assert mock_signal.call_count == 2


class TestLLMQueueStoreLeases:
    """Tests for lease-aware queue updates."""

    def test_claim_assigns_lease_metadata(self) -> None:
        mock_db = MagicMock()
        store = LLMQueueStore(mock_db)

        claimed = {"request_id": "req-1", "lease_id": "lease-1"}
        mock_db[LLMQueueStore.COLLECTION].find_one_and_update.return_value = claimed

        result = store.claim(
            "worker-1",
            worker_kind="remote",
            lease_seconds=90,
            supported_model_ids=["openai:gpt-5.4"],
        )

        assert result == claimed
        query = mock_db[LLMQueueStore.COLLECTION].find_one_and_update.call_args.args[0]
        update = mock_db[LLMQueueStore.COLLECTION].find_one_and_update.call_args.args[1]
        assert query["status"] == "pending"
        assert query["$or"][0]["requested_model_id"]["$in"] == ["openai:gpt-5.4"]
        assert update["$set"]["worker_id"] == "worker-1"
        assert update["$set"]["worker_kind"] == "remote"
        assert "lease_id" in update["$set"]
        assert "lease_expires_at" in update["$set"]

    def test_claim_can_exclude_legacy_model_id_matches(self) -> None:
        mock_db = MagicMock()
        store = LLMQueueStore(mock_db)

        store.claim(
            "worker-1",
            worker_kind="remote",
            supported_model_ids=["custom:abc123:llama-3.3"],
            include_legacy_model_ids=False,
        )

        query = mock_db[LLMQueueStore.COLLECTION].find_one_and_update.call_args.args[0]
        assert "$or" not in query
        assert query["requested_model_id"]["$in"] == ["custom:abc123:llama-3.3"]

    def test_complete_requires_matching_worker_and_lease(self) -> None:
        mock_db = MagicMock()
        store = LLMQueueStore(mock_db)
        mock_db[LLMQueueStore.COLLECTION].update_one.return_value.modified_count = 1

        completed = store.complete(
            "req-1",
            "hello",
            worker_id="worker-1",
            lease_id="lease-1",
            executed_provider="OpenAI",
            executed_model="gpt-5.4",
            executed_model_id="openai:gpt-5.4",
        )

        assert completed is True
        query = mock_db[LLMQueueStore.COLLECTION].update_one.call_args.args[0]
        update = mock_db[LLMQueueStore.COLLECTION].update_one.call_args.args[1]
        assert query == {
            "request_id": "req-1",
            "status": "processing",
            "worker_id": "worker-1",
            "lease_id": "lease-1",
        }
        assert update["$set"]["status"] == "completed"
        assert update["$set"]["executed_model_id"] == "openai:gpt-5.4"

    def test_heartbeat_extends_processing_lease(self) -> None:
        mock_db = MagicMock()
        store = LLMQueueStore(mock_db)
        updated_doc = {"request_id": "req-1", "lease_expires_at": datetime.now(UTC)}
        mock_db[LLMQueueStore.COLLECTION].find_one_and_update.return_value = updated_doc

        result = store.heartbeat("req-1", "worker-1", "lease-1", lease_seconds=75)

        assert result == updated_doc
        query = mock_db[LLMQueueStore.COLLECTION].find_one_and_update.call_args.args[0]
        assert query["request_id"] == "req-1"
        assert query["worker_id"] == "worker-1"
        assert query["lease_id"] == "lease-1"
