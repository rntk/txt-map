"""Unit tests for llm_workers startup cleanup behavior."""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

from lib.llm_queue.store import LLMQueueStore
from llm_workers import COMPLETED_TASK_RETENTION_HOURS, main


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

    @patch("llm_workers.logger")
    @patch("llm_workers.LLMWorker")
    @patch("llm_workers.create_llm_client")
    @patch("llm_workers.MongoLLMCacheStore")
    @patch("llm_workers.LLMQueueStore")
    @patch("llm_workers.AppSettingsStorage")
    @patch("llm_workers.MongoClient")
    def test_main_cleans_up_old_completed_requests_on_start(
        self,
        mock_mongo_client: MagicMock,
        mock_app_settings_storage: MagicMock,
        mock_queue_store_cls: MagicMock,
        mock_cache_store_cls: MagicMock,
        mock_create_llm_client: MagicMock,
        mock_worker_cls: MagicMock,
        mock_logger: MagicMock,
    ) -> None:
        """Startup removes completed requests older than the retention window."""
        mock_client = MagicMock()
        mock_db = MagicMock()
        mock_client.__getitem__.return_value = mock_db
        mock_mongo_client.return_value = mock_client

        mock_queue_store = MagicMock()
        mock_queue_store.cleanup_old.return_value = 2
        mock_queue_store_cls.return_value = mock_queue_store

        mock_llm = MagicMock()
        mock_llm.provider_name = "openai"
        mock_llm.model_name = "gpt-test"
        mock_create_llm_client.return_value = mock_llm

        main()

        mock_queue_store.cleanup_old.assert_called_once_with(
            max_age_hours=COMPLETED_TASK_RETENTION_HOURS,
            statuses=["completed"],
        )
        mock_logger.info.assert_any_call(
            "Removed %s completed LLM queue requests older than %s hours",
            2,
            COMPLETED_TASK_RETENTION_HOURS,
        )
        mock_worker_cls.return_value.run.assert_called_once_with()
        mock_client.close.assert_called_once_with()
