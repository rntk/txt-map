import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import uuid

# Mock dependencies before importing app - must be at module level to catch import-time operations
@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("LLAMACPP_URL", "http://localhost:8080")
    with patch("lifespan.MongoClient"):
        yield

@pytest.fixture
def app():
    """Lazy import app to ensure mocks are applied first."""
    from main import app
    return app

@pytest.fixture
def client(app):
    return TestClient(app)

@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.task_names = [
        "split_topic_generation",
        "subtopics_generation",
        "summarization",
        "mindmap",
        "prefix_tree",
        "insights_generation",
        "markup_generation",
    ]
    storage.get_known_tasks.side_effect = lambda submission: submission.get("tasks", {})
    return storage

@pytest.fixture
def mock_task_queue():
    return MagicMock()

@pytest.fixture(autouse=True)
def setup_overrides(app, mock_storage, mock_task_queue):
    from handlers.dependencies import get_submissions_storage, get_task_queue_storage
    app.dependency_overrides[get_submissions_storage] = lambda: mock_storage
    app.dependency_overrides[get_task_queue_storage] = lambda: mock_task_queue
    yield
    app.dependency_overrides = {}

def test_post_submit(client, mock_storage, mock_task_queue):
    submission_id = str(uuid.uuid4())
    mock_storage.create.return_value = {"submission_id": submission_id}
    
    response = client.post("/api/submit", json={"html": "<html></html>", "source_url": "http://test.com"})
    
    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id
    assert mock_storage.create.called
    assert mock_task_queue.create.call_count == 7

def test_post_upload(client, mock_storage, mock_task_queue):
    submission_id = str(uuid.uuid4())
    mock_storage.create.return_value = {"submission_id": submission_id}

    response = client.post(
        "/api/upload",
        files={"file": ("test.html", b"<html></html>", "text/html")}
    )

    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id
    assert mock_storage.create.called
    assert mock_task_queue.create.call_count == 7

def test_get_submission_status(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.get_overall_status.return_value = "pending"
    
    response = client.get(f"/api/submission/{submission_id}/status")
    
    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id
    assert response.json()["overall_status"] == "pending"


def test_get_submission_status_filters_legacy_storytelling_task(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    sample_submission["tasks"]["storytelling_generation"] = {"status": "pending"}
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.get_overall_status.return_value = "completed"
    mock_storage.get_known_tasks.side_effect = lambda submission: {
        key: value
        for key, value in submission["tasks"].items()
        if key != "storytelling_generation"
    }

    response = client.get(f"/api/submission/{submission_id}/status")

    assert response.status_code == 200
    assert "storytelling_generation" not in response.json()["tasks"]

def test_get_submission(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.get_overall_status.return_value = "completed"
    
    response = client.get(f"/api/submission/{submission_id}")
    
    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id
    assert "results" in response.json()


def test_get_submission_filters_legacy_storytelling_task(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    sample_submission["tasks"]["storytelling_generation"] = {"status": "pending"}
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.get_overall_status.return_value = "completed"
    mock_storage.get_known_tasks.side_effect = lambda submission: {
        key: value
        for key, value in submission["tasks"].items()
        if key != "storytelling_generation"
    }

    response = client.get(f"/api/submission/{submission_id}")

    assert response.status_code == 200
    assert "storytelling_generation" not in response.json()["status"]["tasks"]

def test_delete_submission(client, mock_storage, mock_task_queue, sample_submission):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.delete_by_id.return_value = True
    
    response = client.delete(f"/api/submission/{submission_id}")
    
    assert response.status_code == 200
    assert response.json()["message"] == "Submission deleted"
    mock_task_queue.delete_by_submission.assert_called_once_with(submission_id)
    mock_storage.delete_by_id.assert_called_once_with(submission_id)

def test_post_refresh(client, mock_storage, mock_task_queue, sample_submission):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.expand_recalculation_tasks.return_value = ["summarization"]
    
    response = client.post(f"/api/submission/{submission_id}/refresh", json={"tasks": ["summarization"]})
    
    assert response.status_code == 200
    assert "tasks_queued" in response.json()
    mock_storage.clear_results.assert_called_once()
    mock_task_queue.delete_by_submission.assert_called_once()
    mock_task_queue.create.assert_called_once()

def test_get_word_cloud(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    sample_submission["results"]["sentences"] = ["This is a test sentence."]
    sample_submission["results"]["topics"] = [{"name": "Test", "sentences": [1]}]
    mock_storage.get_by_id.return_value = sample_submission
    
    with patch("handlers.submission_handler.compute_word_frequencies") as mock_compute:
        mock_compute.return_value = [{"word": "test", "frequency": 1}]
        response = client.get(f"/api/submission/{submission_id}/word-cloud")
        
        assert response.status_code == 200
        assert "words" in response.json()
        assert response.json()["sentence_count"] == 1

def test_list_submissions(client, mock_storage, sample_submission):
    mock_storage.list.return_value = [sample_submission]
    mock_storage.get_overall_status.return_value = "pending"
    
    response = client.get("/api/submissions")
    
    assert response.status_code == 200
    assert len(response.json()["submissions"]) == 1
    assert response.json()["count"] == 1

def test_put_read_topics(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission
    
    response = client.put(f"/api/submission/{submission_id}/read-topics", json={"read_topics": ["Topic A"]})
    
    assert response.status_code == 200
    assert response.json()["read_topics"] == ["Topic A"]
    mock_storage.update_read_topics.assert_called_once_with(submission_id, ["Topic A"])

def test_get_global_topics(client, mock_storage):
    mock_storage.aggregate_global_topics.return_value = [{"name": "Topic A", "total_sentences": 5}]
    
    response = client.get("/api/global-topics")
    
    assert response.status_code == 200
    assert len(response.json()["topics"]) == 1

def test_get_global_topics_sentences(client, mock_storage, sample_submission):
    mock_storage.list_with_projection.return_value = [sample_submission]
    
    response = client.get("/api/global-topics/sentences", params={"topic_name": ["Topic A"]})
    
    assert response.status_code == 200
    assert len(response.json()["groups"]) == 1
    assert response.json()["groups"][0]["topic_name"] == "Topic A"

def test_get_global_read_progress(client, mock_storage, sample_submission):
    sample_submission["read_topics"] = ["Topic A"]
    mock_storage.list_with_projection.return_value = [sample_submission]
    
    response = client.get("/api/submissions/read-progress")
    
    assert response.status_code == 200
    # Topic A has [1, 2], total sentences 3
    assert response.json()["read_count"] == 2
    assert response.json()["total_count"] == 3

def test_get_submission_read_progress(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    sample_submission["read_topics"] = ["Topic B"]
    mock_storage.get_by_id.return_value = sample_submission
    
    response = client.get(f"/api/submission/{submission_id}/read-progress")
    
    assert response.status_code == 200
    # Topic B has [3], total sentences 3
    assert response.json()["read_count"] == 1
    assert response.json()["total_count"] == 3


# ── /api/fetch-url tests ──────────────────────────────────────────────────────

def _make_mock_response(content: bytes, content_type: str, status_code: int = 200):
    """Build a minimal mock for requests.Response."""
    mock_resp = MagicMock()
    mock_resp.content = content
    mock_resp.headers = {"Content-Type": content_type}
    mock_resp.status_code = status_code
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


def test_fetch_url_html(client, mock_storage, mock_task_queue):
    """Fetching an HTML URL creates a submission and returns redirect_url."""
    submission_id = str(uuid.uuid4())
    mock_storage.create.return_value = {"submission_id": submission_id}

    html_bytes = b"<html><body><p>Hello</p></body></html>"
    mock_resp = _make_mock_response(html_bytes, "text/html; charset=utf-8")

    with patch("handlers.submission_handler.http_requests.get", return_value=mock_resp):
        response = client.post("/api/fetch-url", json={"url": "https://example.com/article"})

    assert response.status_code == 200
    data = response.json()
    assert data["submission_id"] == submission_id
    assert data["redirect_url"] == f"/page/text/{submission_id}"
    assert mock_storage.create.called
    call_kwargs = mock_storage.create.call_args.kwargs
    assert call_kwargs["source_url"] == "https://example.com/article"
    assert mock_task_queue.create.call_count == 7


def test_fetch_url_pdf(client, mock_storage, mock_task_queue):
    """Fetching a URL that returns a PDF processes it through PDF extraction."""
    submission_id = str(uuid.uuid4())
    mock_storage.create.return_value = {"submission_id": submission_id}

    fake_pdf_bytes = b"%PDF-1.4 fake"
    mock_resp = _make_mock_response(fake_pdf_bytes, "application/pdf")

    fake_html = "<p>PDF content</p>"
    fake_text = "PDF content"

    with patch("handlers.submission_handler.http_requests.get", return_value=mock_resp), \
         patch("handlers.submission_handler._extract_content_from_upload", return_value=(fake_html, fake_text)) as mock_extract:
        response = client.post("/api/fetch-url", json={"url": "https://example.com/doc.pdf"})

    assert response.status_code == 200
    mock_extract.assert_called_once_with("document.pdf", fake_pdf_bytes)
    call_kwargs = mock_storage.create.call_args.kwargs
    assert call_kwargs["html_content"] == fake_html
    assert call_kwargs["text_content"] == fake_text


def test_fetch_url_invalid_scheme(client):
    """Non-http(s) URLs are rejected with 400."""
    response = client.post("/api/fetch-url", json={"url": "ftp://example.com/file"})
    assert response.status_code == 400
    assert "http" in response.json()["detail"].lower()


def test_fetch_url_network_error(client):
    """Network-level errors are surfaced as 502."""
    import requests as _requests
    with patch("handlers.submission_handler.http_requests.get",
               side_effect=_requests.exceptions.ConnectionError("unreachable")):
        response = client.post("/api/fetch-url", json={"url": "https://unreachable.example.com"})

    assert response.status_code == 502


def test_fetch_url_unsupported_content_type(client):
    """Binary/unsupported content types are rejected with 415."""
    mock_resp = _make_mock_response(b"\x50\x4b\x03\x04", "application/zip")

    with patch("handlers.submission_handler.http_requests.get", return_value=mock_resp):
        response = client.post("/api/fetch-url", json={"url": "https://example.com/archive.zip"})

    assert response.status_code == 415
