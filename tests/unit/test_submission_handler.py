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
    storage.task_names = ["split_topic_generation", "subtopics_generation", "summarization", "mindmap", "prefix_tree", "insights_generation"]
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
    assert mock_task_queue.create.call_count == 6

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
    assert mock_task_queue.create.call_count == 6

def test_get_submission_status(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.get_overall_status.return_value = "pending"
    
    response = client.get(f"/api/submission/{submission_id}/status")
    
    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id
    assert response.json()["overall_status"] == "pending"

def test_get_submission(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.get_overall_status.return_value = "completed"
    
    response = client.get(f"/api/submission/{submission_id}")
    
    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id
    assert "results" in response.json()

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
