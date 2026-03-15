"""
Unit tests for the submission handler module.

Tests all functions in handlers/submission_handler.py:
- post_submit
- _extract_content_from_upload
- _queue_all_tasks
- post_upload
- get_submission_status
- get_submission
- delete_submission
- post_refresh
- get_word_cloud
- list_submissions
"""
import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, UTC
from fastapi import HTTPException, UploadFile
import io
import uuid

from handlers.submission_handler import (
    post_submit,
    _extract_content_from_upload,
    _queue_all_tasks,
    post_upload,
    get_submission_status,
    get_submission,
    delete_submission,
    post_refresh,
    get_word_cloud,
    list_submissions,
    SubmitRequest,
    RefreshRequest,
    ALLOWED_UPLOAD_EXTENSIONS,
)


# =============================================================================
# Test: post_submit
# =============================================================================

class TestPostSubmit:
    """Tests for the post_submit endpoint."""

    def test_valid_html_submission_returns_submission_id_and_redirect_url(
        self, mock_submissions_storage, sample_html_content
    ):
        """Valid HTML submission returns submission_id and redirect_url."""
        # Arrange
        submission_id = str(uuid.uuid4())
        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": sample_html_content,
            "text_content": sample_html_content,
            "source_url": ""
        }

        request = SubmitRequest(html=sample_html_content, source_url="")

        # Act
        result = post_submit(request, mock_submissions_storage)

        # Assert
        assert "submission_id" in result
        assert "redirect_url" in result
        assert result["submission_id"] == submission_id
        assert result["redirect_url"] == f"/page/text/{submission_id}"
        mock_submissions_storage.create.assert_called_once_with(
            html_content=sample_html_content,
            text_content=sample_html_content,
            source_url=""
        )

    def test_empty_html_content_handling(self, mock_submissions_storage):
        """Empty HTML content is handled correctly."""
        # Arrange
        submission_id = str(uuid.uuid4())
        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": "",
            "text_content": "",
            "source_url": ""
        }

        request = SubmitRequest(html="", source_url="")

        # Act
        result = post_submit(request, mock_submissions_storage)

        # Assert
        assert result["submission_id"] == submission_id
        mock_submissions_storage.create.assert_called_once_with(
            html_content="",
            text_content="",
            source_url=""
        )

    def test_missing_source_url_defaults_to_empty_string(self, mock_submissions_storage):
        """Missing source_url defaults to empty string."""
        # Arrange
        submission_id = str(uuid.uuid4())
        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": "<p>Test</p>",
            "text_content": "<p>Test</p>",
            "source_url": ""
        }

        # Use default value for source_url
        request = SubmitRequest(html="<p>Test</p>")

        # Act
        result = post_submit(request, mock_submissions_storage)

        # Assert
        assert result["submission_id"] == submission_id
        mock_submissions_storage.create.assert_called_once_with(
            html_content="<p>Test</p>",
            text_content="<p>Test</p>",
            source_url=""
        )

    def test_task_queue_entries_created_for_all_task_types(
        self, mock_submissions_storage, mock_db, sample_html_content
    ):
        """Task queue entries are created for all 5 task types."""
        # Arrange
        submission_id = str(uuid.uuid4())
        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": sample_html_content,
            "text_content": sample_html_content,
            "source_url": ""
        }
        mock_submissions_storage._db = mock_db

        request = SubmitRequest(html=sample_html_content)

        # Act
        result = post_submit(request, mock_submissions_storage)

        # Assert
        assert mock_db.task_queue.insert_one.call_count == 5
        task_types = [
            call_arg[0][0]["task_type"]
            for call_arg in mock_db.task_queue.insert_one.call_args_list
        ]
        assert set(task_types) == {
            "split_topic_generation",
            "subtopics_generation",
            "summarization",
            "mindmap",
            "prefix_tree"
        }

    def test_database_submission_document_has_correct_structure(
        self, mock_submissions_storage, sample_html_content
    ):
        """Database submission document has correct structure."""
        # Arrange
        submission_id = str(uuid.uuid4())
        expected_submission = {
            "submission_id": submission_id,
            "html_content": sample_html_content,
            "text_content": sample_html_content,
            "source_url": "https://example.com"
        }
        mock_submissions_storage.create.return_value = expected_submission

        request = SubmitRequest(
            html=sample_html_content,
            source_url="https://example.com"
        )

        # Act
        result = post_submit(request, mock_submissions_storage)

        # Assert
        mock_submissions_storage.create.assert_called_once_with(
            html_content=sample_html_content,
            text_content=sample_html_content,
            source_url="https://example.com"
        )


# =============================================================================
# Test: _extract_content_from_upload
# =============================================================================

class TestExtractContentFromUpload:
    """Tests for the _extract_content_from_upload function."""

    def test_html_file_content_returned_as_is(self):
        """HTML file (.html, .htm) - content returned as-is for both html and text."""
        # Arrange
        filename = "test.html"
        data = b"<html><body><p>Test content</p></body></html>"

        # Act
        html_content, text_content = _extract_content_from_upload(filename, data)

        # Assert
        assert html_content == "<html><body><p>Test content</p></body></html>"
        assert text_content == "<html><body><p>Test content</p></body></html>"

    def test_htm_file_content_returned_as_is(self):
        """HTM file extension works same as HTML."""
        # Arrange
        filename = "test.htm"
        data = b"<html><body>Content</body></html>"

        # Act
        html_content, text_content = _extract_content_from_upload(filename, data)

        # Assert
        assert html_content == "<html><body>Content</body></html>"
        assert text_content == "<html><body>Content</body></html>"

    def test_plain_text_file_content_returned_as_is(self):
        """Plain text file (.txt) - content returned as-is for both html and text."""
        # Arrange
        filename = "test.txt"
        data = b"This is plain text content."

        # Act
        html_content, text_content = _extract_content_from_upload(filename, data)

        # Assert
        assert html_content == "This is plain text content."
        assert text_content == "This is plain text content."

    def test_markdown_file_converted_to_html(self, mock_markdown):
        """Markdown file (.md) - converted to HTML, original text preserved."""
        # Arrange
        filename = "test.md"
        text_data = b"# Heading\n\nSome **bold** text."
        mock_markdown.return_value = "<h1>Heading</h1>\n<p>Some <strong>bold</strong> text.</p>"

        # Act
        html_content, text_content = _extract_content_from_upload(filename, text_data)

        # Assert
        assert html_content == "<h1>Heading</h1>\n<p>Some <strong>bold</strong> text.</p>"
        assert text_content == "# Heading\n\nSome **bold** text."
        mock_markdown.assert_called_once()

    def test_pdf_file_html_generated_and_text_extracted(self, mock_pdf_to_html):
        """PDF file (.pdf) - HTML generated via pdf_to_html, text extracted."""
        # Arrange
        filename = "test.pdf"
        pdf_data = b"%PDF-1.4..."

        # Act
        html_content, text_content = _extract_content_from_upload(filename, pdf_data)

        # Assert
        assert html_content == "<html><body><p>PDF HTML content</p></body></html>"
        assert text_content == "PDF text content"
        mock_pdf_to_html['convert'].assert_called_once_with(pdf_data)
        mock_pdf_to_html['extract'].assert_called_once_with(pdf_data)

    def test_pdf_with_no_extractable_text_raises_http_exception_400(self, mock_pdf_to_html):
        """PDF with no extractable text raises HTTPException 400."""
        # Arrange
        filename = "empty.pdf"
        pdf_data = b"%PDF-1.4..."
        mock_pdf_to_html['extract'].return_value = "   "  # Only whitespace

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            _extract_content_from_upload(filename, pdf_data)

        assert exc_info.value.status_code == 400
        assert "no extractable text" in exc_info.value.detail

    def test_unsupported_file_extension_raises_http_exception_415(self):
        """Unsupported file extension raises HTTPException 415."""
        # Arrange
        filename = "test.exe"
        data = b"binary data"

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            _extract_content_from_upload(filename, data)

        assert exc_info.value.status_code == 415
        assert "Unsupported file type" in exc_info.value.detail

    def test_filename_without_extension_raises_http_exception_415(self):
        """Filename without extension raises HTTPException 415."""
        # Arrange
        filename = "noextension"
        data = b"some data"

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            _extract_content_from_upload(filename, data)

        assert exc_info.value.status_code == 415

    def test_binary_corrupted_file_handling_with_utf8_replacement(self):
        """Binary/corrupted file handling with UTF-8 errors replacement."""
        # Arrange
        filename = "test.txt"
        # Invalid UTF-8 bytes
        data = b"\x80\x81\x82\x83"

        # Act
        html_content, text_content = _extract_content_from_upload(filename, data)

        # Assert - should not raise, content should have replacement characters
        assert html_content is not None
        assert text_content is not None

    def test_case_insensitive_extension_handling(self):
        """Extension handling is case insensitive."""
        # Arrange
        filename = "test.HTML"
        data = b"<html>Content</html>"

        # Act
        html_content, text_content = _extract_content_from_upload(filename, data)

        # Assert
        assert html_content == "<html>Content</html>"

    def test_markdown_with_codehilite_extension(self, mock_markdown):
        """Markdown conversion uses extra and codehilite extensions."""
        # Arrange
        filename = "test.md"
        text_data = b"# Test\n\n```python\nprint('hello')\n```"

        # Act
        _extract_content_from_upload(filename, text_data)

        # Assert
        call_args = mock_markdown.call_args
        assert 'extra' in call_args[1]['extensions']
        assert 'codehilite' in call_args[1]['extensions']


# =============================================================================
# Test: _queue_all_tasks
# =============================================================================

class TestQueueAllTasks:
    """Tests for the _queue_all_tasks function."""

    def test_all_5_task_types_are_queued(self, mock_db):
        """All 5 task types are queued."""
        # Arrange
        submission_id = str(uuid.uuid4())

        # Act
        _queue_all_tasks(mock_db, submission_id)

        # Assert
        assert mock_db.task_queue.insert_one.call_count == 5
        task_types = [
            call_arg[0][0]["task_type"]
            for call_arg in mock_db.task_queue.insert_one.call_args_list
        ]
        assert set(task_types) == {
            "split_topic_generation",
            "subtopics_generation",
            "summarization",
            "mindmap",
            "prefix_tree"
        }

    def test_correct_priority_ordering(self, mock_db):
        """Correct priority ordering (split=1, subtopics=2, others=3)."""
        # Arrange
        submission_id = str(uuid.uuid4())

        # Act
        _queue_all_tasks(mock_db, submission_id)

        # Assert
        calls = mock_db.task_queue.insert_one.call_args_list
        priorities = {
            call[0][0]["task_type"]: call[0][0]["priority"]
            for call in calls
        }
        assert priorities["split_topic_generation"] == 1
        assert priorities["subtopics_generation"] == 2
        assert priorities["summarization"] == 3
        assert priorities["mindmap"] == 3
        assert priorities["prefix_tree"] == 3

    def test_all_tasks_start_with_status_pending(self, mock_db):
        """All tasks start with status 'pending'."""
        # Arrange
        submission_id = str(uuid.uuid4())

        # Act
        _queue_all_tasks(mock_db, submission_id)

        # Assert
        calls = mock_db.task_queue.insert_one.call_args_list
        for call_arg in calls:
            assert call_arg[0][0]["status"] == "pending"

    def test_timestamps_set_correctly(self, mock_db):
        """Timestamps are set correctly (created_at set, others None)."""
        # Arrange
        submission_id = str(uuid.uuid4())

        # Act
        _queue_all_tasks(mock_db, submission_id)

        # Assert
        calls = mock_db.task_queue.insert_one.call_args_list
        for call_arg in calls:
            task = call_arg[0][0]
            assert task["created_at"] is not None
            assert task["started_at"] is None
            assert task["completed_at"] is None

    def test_worker_id_and_error_fields_are_none_initially(self, mock_db):
        """worker_id and error fields are None initially."""
        # Arrange
        submission_id = str(uuid.uuid4())

        # Act
        _queue_all_tasks(mock_db, submission_id)

        # Assert
        calls = mock_db.task_queue.insert_one.call_args_list
        for call_arg in calls:
            task = call_arg[0][0]
            assert task["worker_id"] is None
            assert task["error"] is None

    def test_retry_count_initialized_to_zero(self, mock_db):
        """retry_count is initialized to 0."""
        # Arrange
        submission_id = str(uuid.uuid4())

        # Act
        _queue_all_tasks(mock_db, submission_id)

        # Assert
        calls = mock_db.task_queue.insert_one.call_args_list
        for call_arg in calls:
            assert call_arg[0][0]["retry_count"] == 0

    def test_all_tasks_have_same_submission_id(self, mock_db):
        """All tasks have the same submission_id."""
        # Arrange
        submission_id = str(uuid.uuid4())

        # Act
        _queue_all_tasks(mock_db, submission_id)

        # Assert
        calls = mock_db.task_queue.insert_one.call_args_list
        for call_arg in calls:
            assert call_arg[0][0]["submission_id"] == submission_id


# =============================================================================
# Test: post_upload
# =============================================================================

class TestPostUpload:
    """Tests for the post_upload endpoint."""

    def _create_async_mock_file(self, filename: str, data: bytes):
        """Helper to create a mock UploadFile with async read."""
        async def async_read():
            return data

        mock_file = MagicMock()
        mock_file.filename = filename
        mock_file.read = async_read
        return mock_file

    @pytest.mark.asyncio
    async def test_valid_html_file_upload_creates_submission_successfully(
        self, mock_submissions_storage, sample_html_content
    ):
        """Valid HTML file upload creates submission successfully."""
        # Arrange
        submission_id = str(uuid.uuid4())
        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": sample_html_content,
            "text_content": sample_html_content,
            "source_url": "test.html"
        }

        mock_file = self._create_async_mock_file(
            "test.html",
            sample_html_content.encode('utf-8')
        )

        # Act
        result = await post_upload(mock_file, mock_submissions_storage)

        # Assert
        assert result["submission_id"] == submission_id
        assert "redirect_url" in result
        mock_submissions_storage.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_valid_pdf_file_upload_creates_submission_successfully(
        self, mock_submissions_storage, mock_pdf_to_html
    ):
        """Valid PDF file upload creates submission successfully."""
        # Arrange
        submission_id = str(uuid.uuid4())
        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": "<html>PDF HTML</html>",
            "text_content": "PDF text",
            "source_url": "test.pdf"
        }

        mock_file = self._create_async_mock_file("test.pdf", b"%PDF-1.4...")

        # Act
        result = await post_upload(mock_file, mock_submissions_storage)

        # Assert
        assert result["submission_id"] == submission_id
        mock_submissions_storage.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_valid_markdown_file_upload_creates_submission_successfully(
        self, mock_submissions_storage, mock_markdown
    ):
        """Valid Markdown file upload creates submission successfully."""
        # Arrange
        submission_id = str(uuid.uuid4())
        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": "<h1>MD</h1>",
            "text_content": "# MD",
            "source_url": "test.md"
        }

        mock_file = self._create_async_mock_file("test.md", b"# MD")

        # Act
        result = await post_upload(mock_file, mock_submissions_storage)

        # Assert
        assert result["submission_id"] == submission_id
        mock_submissions_storage.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_unsupported_file_type_returns_http_415(self, mock_submissions_storage):
        """Unsupported file type returns HTTP 415."""
        # Arrange
        mock_file = self._create_async_mock_file("test.exe", b"binary")

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await post_upload(mock_file, mock_submissions_storage)

        assert exc_info.value.status_code == 415

    @pytest.mark.asyncio
    async def test_missing_file_in_request_raises_appropriate_error(self, mock_submissions_storage):
        """Missing file in request raises appropriate error."""
        # Arrange
        mock_file = self._create_async_mock_file(None, b"data")

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await post_upload(mock_file, mock_submissions_storage)

        assert exc_info.value.status_code == 415

    @pytest.mark.asyncio
    async def test_task_queue_entries_created_after_successful_upload(
        self, mock_submissions_storage, mock_db, sample_html_content
    ):
        """Task queue entries created after successful upload."""
        # Arrange
        submission_id = str(uuid.uuid4())
        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": sample_html_content,
            "text_content": sample_html_content,
            "source_url": "test.html"
        }
        mock_submissions_storage._db = mock_db

        mock_file = self._create_async_mock_file(
            "test.html",
            sample_html_content.encode('utf-8')
        )

        # Act
        await post_upload(mock_file, mock_submissions_storage)

        # Assert
        assert mock_db.task_queue.insert_one.call_count == 5


# =============================================================================
# Test: get_submission_status
# =============================================================================

class TestGetSubmissionStatus:
    """Tests for the get_submission_status endpoint."""

    def test_valid_submission_id_returns_all_task_statuses(
        self, mock_submissions_storage, sample_submission
    ):
        """Valid submission_id returns all task statuses."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = get_submission_status(submission_id, mock_submissions_storage)

        # Assert
        assert result["submission_id"] == submission_id
        assert "tasks" in result
        assert "overall_status" in result
        assert result["tasks"] == sample_submission["tasks"]

    def test_non_existent_submission_id_raises_http_404(
        self, mock_submissions_storage
    ):
        """Non-existent submission_id raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = None

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            get_submission_status("non-existent-id", mock_submissions_storage)

        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail

    def test_overall_status_correctly_reflects_individual_task_statuses(
        self, mock_submissions_storage, sample_submission
    ):
        """Overall status correctly reflects individual task statuses."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = get_submission_status(submission_id, mock_submissions_storage)

        # Assert
        assert result["overall_status"] == "pending"
        mock_submissions_storage.get_overall_status.assert_called_once_with(
            sample_submission
        )

    def test_response_includes_required_fields(
        self, mock_submissions_storage, sample_submission
    ):
        """Response includes submission_id, tasks, and overall_status."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = get_submission_status(submission_id, mock_submissions_storage)

        # Assert
        assert "submission_id" in result
        assert "tasks" in result
        assert "overall_status" in result


# =============================================================================
# Test: get_submission
# =============================================================================

class TestGetSubmission:
    """Tests for the get_submission endpoint."""

    def test_valid_submission_returns_full_submission_data(
        self, mock_submissions_storage, sample_submission
    ):
        """Valid submission returns full submission data."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = get_submission(submission_id, mock_submissions_storage)

        # Assert
        assert result["submission_id"] == submission_id
        assert result["source_url"] == sample_submission["source_url"]
        assert result["text_content"] == sample_submission["text_content"]
        assert result["html_content"] == sample_submission["html_content"]

    def test_response_includes_source_url_text_content_html_content_created_at(
        self, mock_submissions_storage, sample_submission
    ):
        """Response includes source_url, text_content, html_content, created_at."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = get_submission(submission_id, mock_submissions_storage)

        # Assert
        assert "source_url" in result
        assert "text_content" in result
        assert "html_content" in result
        assert "created_at" in result

    def test_status_includes_overall_and_individual_task_statuses(
        self, mock_submissions_storage, sample_submission
    ):
        """Status includes overall and individual task statuses."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.get_overall_status.return_value = "processing"

        # Act
        result = get_submission(submission_id, mock_submissions_storage)

        # Assert
        assert "status" in result
        assert "overall" in result["status"]
        assert "tasks" in result["status"]
        assert result["status"]["overall"] == "processing"

    def test_results_include_all_processed_data(
        self, mock_submissions_storage, sample_submission
    ):
        """Results include all processed data (sentences, topics, summaries, etc.)."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.get_overall_status.return_value = "completed"

        # Act
        result = get_submission(submission_id, mock_submissions_storage)

        # Assert
        assert "results" in result
        assert "sentences" in result["results"]
        assert "topics" in result["results"]

    def test_non_existent_submission_raises_http_404(
        self, mock_submissions_storage
    ):
        """Non-existent submission raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = None

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            get_submission("non-existent-id", mock_submissions_storage)

        assert exc_info.value.status_code == 404


# =============================================================================
# Test: delete_submission
# =============================================================================

class TestDeleteSubmission:
    """Tests for the delete_submission endpoint."""

    def test_valid_submission_deleted_successfully(
        self, mock_submissions_storage, sample_submission, mock_db
    ):
        """Valid submission deleted successfully."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        mock_db.submissions.delete_one.return_value = MagicMock(deleted_count=1)

        # Act
        result = delete_submission(submission_id, mock_submissions_storage)

        # Assert
        assert result["message"] == "Submission deleted"
        assert result["submission_id"] == submission_id
        mock_db.task_queue.delete_many.assert_called_once_with(
            {"submission_id": submission_id}
        )
        mock_db.submissions.delete_one.assert_called_once_with(
            {"submission_id": submission_id}
        )

    def test_associated_task_queue_entries_are_deleted(
        self, mock_submissions_storage, sample_submission, mock_db
    ):
        """Associated task queue entries are deleted."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        mock_db.submissions.delete_one.return_value = MagicMock(deleted_count=1)

        # Act
        delete_submission(submission_id, mock_submissions_storage)

        # Assert
        mock_db.task_queue.delete_many.assert_called_once_with(
            {"submission_id": submission_id}
        )

    def test_non_existent_submission_raises_http_404(
        self, mock_submissions_storage
    ):
        """Non-existent submission raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = None

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            delete_submission("non-existent-id", mock_submissions_storage)

        assert exc_info.value.status_code == 404

    def test_failed_deletion_returns_http_500(
        self, mock_submissions_storage, sample_submission, mock_db
    ):
        """Failed deletion returns HTTP 500."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        mock_db.submissions.delete_one.return_value = MagicMock(deleted_count=0)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            delete_submission(submission_id, mock_submissions_storage)

        assert exc_info.value.status_code == 500
        assert "Failed to delete" in exc_info.value.detail


# =============================================================================
# Test: post_refresh
# =============================================================================

class TestPostRefresh:
    """Tests for the post_refresh endpoint."""

    def test_refresh_all_tasks_when_tasks_is_all(
        self, mock_submissions_storage, sample_submission, mock_db
    ):
        """Refresh all tasks when tasks=['all']."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.expand_recalculation_tasks.return_value = (
            mock_submissions_storage.task_names
        )

        request = RefreshRequest(tasks=["all"])

        # Act
        result = post_refresh(submission_id, request, mock_submissions_storage)

        # Assert
        assert "tasks_queued" in result
        mock_submissions_storage.clear_results.assert_called_once()
        assert mock_db.task_queue.insert_one.call_count == 5

    def test_refresh_specific_valid_task_types(
        self, mock_submissions_storage, sample_submission, mock_db
    ):
        """Refresh specific valid task types."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.expand_recalculation_tasks.return_value = [
            "split_topic_generation",
            "summarization"
        ]

        request = RefreshRequest(tasks=["split_topic_generation", "summarization"])

        # Act
        result = post_refresh(submission_id, request, mock_submissions_storage)

        # Assert
        assert "tasks_queued" in result
        mock_submissions_storage.clear_results.assert_called_once()

    def test_invalid_task_names_raise_http_400(
        self, mock_submissions_storage, sample_submission
    ):
        """Invalid task names raise HTTP 400."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission

        request = RefreshRequest(tasks=["invalid_task"])

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            post_refresh(submission_id, request, mock_submissions_storage)

        assert exc_info.value.status_code == 400
        assert "Unsupported task" in exc_info.value.detail

    def test_results_are_cleared_for_specified_tasks(
        self, mock_submissions_storage, sample_submission, mock_db
    ):
        """Results are cleared for specified tasks."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.expand_recalculation_tasks.return_value = [
            "split_topic_generation"
        ]

        request = RefreshRequest(tasks=["split_topic_generation"])

        # Act
        post_refresh(submission_id, request, mock_submissions_storage)

        # Assert
        mock_submissions_storage.clear_results.assert_called_once()

    def test_task_statuses_reset_to_pending(
        self, mock_submissions_storage, sample_submission, mock_db
    ):
        """Task statuses reset to 'pending'."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.expand_recalculation_tasks.return_value = [
            "split_topic_generation"
        ]

        request = RefreshRequest(tasks=["split_topic_generation"])

        # Act
        post_refresh(submission_id, request, mock_submissions_storage)

        # Assert
        # Check that new tasks are queued with pending status
        calls = mock_db.task_queue.insert_one.call_args_list
        for call_arg in calls:
            assert call_arg[0][0]["status"] == "pending"

    def test_new_task_queue_entries_created(
        self, mock_submissions_storage, sample_submission, mock_db
    ):
        """New task queue entries created."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.expand_recalculation_tasks.return_value = [
            "split_topic_generation"
        ]

        request = RefreshRequest(tasks=["split_topic_generation"])

        # Act
        post_refresh(submission_id, request, mock_submissions_storage)

        # Assert
        mock_db.task_queue.delete_many.assert_called_once()
        assert mock_db.task_queue.insert_one.call_count == 1

    def test_non_existent_submission_raises_http_404(
        self, mock_submissions_storage
    ):
        """Non-existent submission raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = None

        request = RefreshRequest(tasks=["all"])

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            post_refresh("non-existent-id", request, mock_submissions_storage)

        assert exc_info.value.status_code == 404

    def test_dependent_tasks_included_based_on_task_dependencies(
        self, mock_submissions_storage, sample_submission, mock_db
    ):
        """Dependent tasks are included based on task_dependencies."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        # When split_topic_generation is requested, all dependent tasks should be included
        mock_submissions_storage.expand_recalculation_tasks.return_value = (
            mock_submissions_storage.task_names
        )

        request = RefreshRequest(tasks=["split_topic_generation"])

        # Act
        result = post_refresh(submission_id, request, mock_submissions_storage)

        # Assert
        # All 5 tasks should be queued due to dependencies
        assert len(result["tasks_queued"]) == 5


# =============================================================================
# Test: get_word_cloud
# =============================================================================

class TestGetWordCloud:
    """Tests for the get_word_cloud endpoint."""

    @patch('handlers.submission_handler.compute_word_frequencies')
    def test_empty_path_returns_all_topics(
        self, mock_compute_freq, mock_submissions_storage, sample_submission
    ):
        """Empty path returns all topics."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_compute_freq.return_value = [{"word": "test", "frequency": 1}]

        # Act
        result = get_word_cloud(submission_id, path=[], submissions_storage=mock_submissions_storage)

        # Assert
        assert "words" in result
        assert "sentence_count" in result
        mock_compute_freq.assert_called_once()

    @patch('handlers.submission_handler.compute_word_frequencies')
    def test_specific_path_filters_matching_topics(
        self, mock_compute_freq, mock_submissions_storage, sample_submission
    ):
        """Specific path filters matching topics."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        sample_submission["results"]["topics"] = [
            {"name": "Sport>Tennis", "sentences": [1]},
            {"name": "Sport>Football", "sentences": [2]},
            {"name": "Technology", "sentences": [3]}
        ]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_compute_freq.return_value = [{"word": "sport", "frequency": 2}]

        # Act
        result = get_word_cloud(
            submission_id,
            path=["Sport"],
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert result["sentence_count"] == 2  # Tennis and Football sentences

    @patch('handlers.submission_handler.compute_word_frequencies')
    def test_top_n_parameter_limits_results(
        self, mock_compute_freq, mock_submissions_storage, sample_submission
    ):
        """top_n parameter limits results (1-200 range)."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_compute_freq.return_value = [{"word": f"word{i}", "frequency": i} for i in range(10)]

        # Act
        result = get_word_cloud(
            submission_id,
            path=[],
            top_n=10,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert "words" in result
        # Verify top_n was passed to compute_word_frequencies
        call_args = mock_compute_freq.call_args
        assert call_args[1]['top_n'] == 10

    def test_top_n_outside_valid_range_raises_error(
        self, mock_submissions_storage, sample_submission
    ):
        """top_n outside valid range raises error."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission

        # Act & Assert - top_n=0 should raise HTTPException
        with pytest.raises(HTTPException) as exc_info:
            get_word_cloud(
                submission_id,
                path=[],
                top_n=0,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400
        assert "top_n must be between 1 and 200" in exc_info.value.detail

        # Act & Assert - top_n > 200 should raise HTTPException
        with pytest.raises(HTTPException) as exc_info:
            get_word_cloud(
                submission_id,
                path=[],
                top_n=201,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400
        assert "top_n must be between 1 and 200" in exc_info.value.detail

    def test_empty_sentences_returns_empty_words_list(
        self, mock_submissions_storage, sample_submission
    ):
        """Empty sentences returns empty words list."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        sample_submission["results"]["sentences"] = []
        mock_submissions_storage.get_by_id.return_value = sample_submission

        # Act
        result = get_word_cloud(submission_id, path=[], submissions_storage=mock_submissions_storage)

        # Assert
        assert result["words"] == []
        assert result["sentence_count"] == 0

    @patch('handlers.submission_handler.compute_word_frequencies')
    def test_nltk_tokenization_and_lemmatization_applied(
        self, mock_compute_freq, mock_submissions_storage, sample_submission
    ):
        """NLTK tokenization and lemmatization applied correctly."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_compute_freq.return_value = [{"word": "test", "frequency": 1}]

        # Act
        get_word_cloud(submission_id, path=[], submissions_storage=mock_submissions_storage)

        # Assert - compute_word_frequencies was called (which uses NLTK internally)
        mock_compute_freq.assert_called_once()

    @patch('handlers.submission_handler.compute_word_frequencies')
    def test_stop_words_are_filtered_out(
        self, mock_compute_freq, mock_submissions_storage, sample_submission
    ):
        """Stop words are filtered out."""
        # Arrange
        submission_id = sample_submission["submission_id"]
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_compute_freq.return_value = [{"word": "significant", "frequency": 5}]

        # Act
        result = get_word_cloud(submission_id, path=[], submissions_storage=mock_submissions_storage)

        # Assert
        assert "words" in result
        # The compute_word_frequencies function handles stop word filtering internally

    def test_non_existent_submission_raises_http_404(
        self, mock_submissions_storage
    ):
        """Non-existent submission raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = None

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            get_word_cloud("non-existent-id", path=[], submissions_storage=mock_submissions_storage)

        assert exc_info.value.status_code == 404


# =============================================================================
# Test: list_submissions
# =============================================================================

class TestListSubmissions:
    """Tests for the list_submissions endpoint."""

    def test_returns_submissions_sorted_by_created_at_descending(
        self, mock_submissions_storage, mock_db, sample_submission
    ):
        """Returns submissions sorted by created_at descending."""
        # Arrange
        mock_db.submissions.find.return_value.sort.return_value.limit.return_value = [
            sample_submission
        ]
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = list_submissions(submissions_storage=mock_submissions_storage)

        # Assert
        mock_db.submissions.find.return_value.sort.assert_called_once_with(
            "created_at", -1
        )

    def test_submission_id_filter_returns_single_submission(
        self, mock_submissions_storage, mock_db, sample_submission
    ):
        """submission_id filter returns single submission."""
        # Arrange
        mock_db.submissions.find.return_value.sort.return_value.limit.return_value = [
            sample_submission
        ]
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = list_submissions(
            submission_id=sample_submission["submission_id"],
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert len(result["submissions"]) == 1
        assert result["submissions"][0]["submission_id"] == sample_submission["submission_id"]

    def test_status_filter_returns_only_matching_submissions(
        self, mock_submissions_storage, mock_db, sample_submission
    ):
        """status filter returns only matching submissions."""
        # Arrange
        mock_db.submissions.find.return_value.sort.return_value.limit.return_value = [
            sample_submission
        ]
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = list_submissions(
            status="pending",
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert "submissions" in result
        assert "count" in result
        assert result["count"] >= 1
        assert len(result["submissions"]) == result["count"]
        # Verify the returned submission has expected fields
        submission = result["submissions"][0]
        assert submission["submission_id"] == sample_submission["submission_id"]
        assert submission["overall_status"] == "pending"
        assert "text_characters" in submission
        assert "sentence_count" in submission
        assert "topic_count" in submission

    def test_limit_parameter_restricts_results_count(
        self, mock_submissions_storage, mock_db, sample_submission
    ):
        """limit parameter restricts results count."""
        # Arrange
        mock_db.submissions.find.return_value.sort.return_value.limit.return_value = [
            sample_submission
        ]
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = list_submissions(limit=5, submissions_storage=mock_submissions_storage)

        # Assert
        assert result["count"] <= 5
        mock_db.submissions.find.return_value.sort.return_value.limit.assert_called_with(5)

    def test_non_positive_limit_raises_http_400(
        self, mock_submissions_storage
    ):
        """Non-positive limit raises HTTP 400."""
        # Arrange & Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            list_submissions(limit=0, submissions_storage=mock_submissions_storage)

        assert exc_info.value.status_code == 400
        assert "Limit must be positive" in exc_info.value.detail

        with pytest.raises(HTTPException) as exc_info:
            list_submissions(limit=-1, submissions_storage=mock_submissions_storage)

        assert exc_info.value.status_code == 400

    def test_response_includes_metadata(
        self, mock_submissions_storage, mock_db, sample_submission
    ):
        """Response includes metadata (text_characters, sentence_count, topic_count)."""
        # Arrange
        mock_db.submissions.find.return_value.sort.return_value.limit.return_value = [
            sample_submission
        ]
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = list_submissions(submissions_storage=mock_submissions_storage)

        # Assert
        assert len(result["submissions"]) > 0
        item = result["submissions"][0]
        assert "text_characters" in item
        assert "sentence_count" in item
        assert "topic_count" in item

    def test_response_includes_count(
        self, mock_submissions_storage, mock_db, sample_submission
    ):
        """Response includes count of submissions."""
        # Arrange
        mock_db.submissions.find.return_value.sort.return_value.limit.return_value = [
            sample_submission
        ]
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.get_overall_status.return_value = "pending"

        # Act
        result = list_submissions(submissions_storage=mock_submissions_storage)

        # Assert
        assert "count" in result
        assert result["count"] == len(result["submissions"])


# =============================================================================
# Integration Tests
# =============================================================================

class TestSubmissionHandlerIntegration:
    """Integration tests for the submission handler."""

    def test_full_submission_workflow_html_content(
        self, mock_submissions_storage, mock_db, sample_html_content
    ):
        """Test full submission workflow with HTML content."""
        # Arrange
        submission_id = str(uuid.uuid4())
        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": sample_html_content,
            "text_content": sample_html_content,
            "source_url": "",
            "tasks": {
                "split_topic_generation": {"status": "pending"},
                "subtopics_generation": {"status": "pending"},
                "summarization": {"status": "pending"},
                "mindmap": {"status": "pending"},
                "prefix_tree": {"status": "pending"}
            },
            "results": {}
        }
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.get_overall_status.return_value = "pending"

        request = SubmitRequest(html=sample_html_content)

        # Act - Submit
        submit_result = post_submit(request, mock_submissions_storage)

        # Assert - Submit
        assert submit_result["submission_id"] == submission_id

        # Act - Get Status
        status_result = get_submission_status(submission_id, mock_submissions_storage)

        # Assert - Status
        assert status_result["submission_id"] == submission_id
        assert status_result["overall_status"] == "pending"

    @pytest.mark.asyncio
    async def test_upload_and_retrieve_submission_workflow(
        self, mock_submissions_storage, mock_db
    ):
        """Test upload and retrieve submission workflow."""
        # Arrange
        from datetime import datetime, UTC
        submission_id = str(uuid.uuid4())
        html_content = "<html><body><p>Test</p></body></html>"

        mock_submissions_storage.create.return_value = {
            "submission_id": submission_id,
            "html_content": html_content,
            "text_content": html_content,
            "source_url": "test.html",
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "tasks": {},
            "results": {}
        }
        mock_submissions_storage._db = mock_db
        mock_submissions_storage.get_overall_status.return_value = "pending"
        mock_submissions_storage.get_by_id.return_value = {
            "submission_id": submission_id,
            "html_content": html_content,
            "text_content": html_content,
            "source_url": "test.html",
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "tasks": {},
            "results": {}
        }

        async def async_read():
            return html_content.encode('utf-8')

        mock_file = MagicMock()
        mock_file.filename = "test.html"
        mock_file.read = async_read

        # Act - Upload
        upload_result = await post_upload(mock_file, mock_submissions_storage)

        # Assert - Upload
        assert upload_result["submission_id"] == submission_id

        # Act - Get Submission
        get_result = get_submission(submission_id, mock_submissions_storage)

        # Assert - Get
        assert get_result["submission_id"] == submission_id
        assert get_result["source_url"] == "test.html"
