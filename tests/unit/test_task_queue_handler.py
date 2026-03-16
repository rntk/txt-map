import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from bson import ObjectId
import uuid

# Mock dependencies before importing app
@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("LLAMACPP_URL", "http://localhost:8080")
    with patch("lifespan.MongoClient"):
        yield

from main import app
from handlers.dependencies import get_submissions_storage, get_task_queue_storage

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.task_names = ["split_topic_generation", "subtopics_generation", "summarization", "mindmap", "prefix_tree"]
    return storage

@pytest.fixture
def mock_task_queue():
    return MagicMock()

@pytest.fixture(autouse=True)
def setup_overrides(mock_storage, mock_task_queue):
    app.dependency_overrides[get_submissions_storage] = lambda: mock_storage
    app.dependency_overrides[get_task_queue_storage] = lambda: mock_task_queue
    yield
    app.dependency_overrides = {}

def test_list_task_queue(client, mock_task_queue):
    task_id = str(ObjectId())
    mock_task_queue.list.return_value = [
        {"_id": ObjectId(task_id), "submission_id": "test-sub", "task_type": "summarization", "status": "pending"}
    ]
    
    response = client.get("/api/task-queue")
    
    assert response.status_code == 200
    assert len(response.json()["tasks"]) == 1
    assert response.json()["tasks"][0]["id"] == task_id

def test_delete_task_queue_entry(client, mock_task_queue):
    task_id = str(ObjectId())
    mock_task_queue.delete_by_id.return_value = True
    
    response = client.delete(f"/api/task-queue/{task_id}")
    
    assert response.status_code == 200
    assert response.json()["deleted"] is True
    mock_task_queue.delete_by_id.assert_called_once_with(task_id)

def test_repeat_task_queue_entry(client, mock_storage, mock_task_queue, sample_submission):
    task_id = str(ObjectId())
    submission_id = sample_submission["submission_id"]
    mock_task_queue.get_by_id.return_value = {
        "task_type": "summarization",
        "submission_id": submission_id
    }
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.expand_recalculation_tasks.return_value = ["summarization"]
    mock_task_queue.create.return_value = "new-task-id"
    
    response = client.post(f"/api/task-queue/{task_id}/repeat")
    
    assert response.status_code == 200
    assert response.json()["requeued"] is True
    assert "summarization" in response.json()["tasks"]

def test_add_task_queue_entry(client, mock_storage, mock_task_queue, sample_submission):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.expand_recalculation_tasks.return_value = ["summarization"]
    mock_task_queue.create.return_value = "new-task-id"
    
    payload = {
        "submission_id": submission_id,
        "task_type": "summarization",
        "priority": 5
    }
    
    response = client.post("/api/task-queue/add", json=payload)
    
    assert response.status_code == 200
    assert response.json()["queued"] is True
    assert "summarization" in response.json()["tasks"]
