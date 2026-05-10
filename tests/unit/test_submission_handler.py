import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import uuid
import re
from handlers.submission_handler import _extract_content_from_upload


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
        "topic_marker_summary_generation",
        "clustering_generation",
        "topic_modeling_generation",
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

    response = client.post(
        "/api/submit", json={"html": "<html></html>", "source_url": "http://test.com"}
    )

    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id
    assert mock_storage.create.called
    assert mock_task_queue.create.call_count == 2


def test_post_upload(client, mock_storage, mock_task_queue):
    submission_id = str(uuid.uuid4())
    mock_storage.create.return_value = {"submission_id": submission_id}

    response = client.post(
        "/api/upload", files={"file": ("test.html", b"<html></html>", "text/html")}
    )

    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id
    assert mock_storage.create.called
    assert mock_task_queue.create.call_count == 2


def test_extract_content_from_upload_allows_image_only_pdf_html():

    html_content = (
        '<!DOCTYPE html><html><body><img src="data:image/png;base64,AAAA" '
        'alt="PDF Image" /></body></html>'
    )

    with (
        patch(
            "lib.pdf_to_html.convert_pdf_to_html",
            return_value=html_content,
        ),
        patch("lib.pdf_to_html.extract_text_from_pdf", return_value=""),
    ):
        extracted_html, extracted_text = _extract_content_from_upload(
            "scan.pdf", b"%PDF-1.4"
        )

    assert extracted_html == html_content
    assert extracted_text == ""


def test_extract_content_from_upload_rejects_empty_pdf_without_text_or_images():

    html_content = "<!DOCTYPE html><html><body></body></html>"

    with (
        patch(
            "lib.pdf_to_html.convert_pdf_to_html",
            return_value=html_content,
        ),
        patch("lib.pdf_to_html.extract_text_from_pdf", return_value=""),
    ):
        with pytest.raises(HTTPException, match="no extractable text"):
            _extract_content_from_upload("empty.pdf", b"%PDF-1.4")


def test_get_submission_status(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission
    mock_storage.get_overall_status.return_value = "pending"

    response = client.get(f"/api/submission/{submission_id}/status")

    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id
    assert response.json()["overall_status"] == "pending"


def test_get_submission_status_filters_legacy_storytelling_task(
    client, mock_storage, sample_submission
):
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


def test_get_submission_filters_legacy_storytelling_task(
    client, mock_storage, sample_submission
):
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

    response = client.post(
        f"/api/submission/{submission_id}/refresh", json={"tasks": ["summarization"]}
    )

    assert response.status_code == 200
    assert "tasks_queued" in response.json()
    mock_storage.clear_results.assert_called_once()
    mock_task_queue.delete_by_submission.assert_called_once()
    mock_task_queue.create.assert_called_once()


def test_get_tag_frequency_returns_lemmatized_rows_and_topics(
    client, mock_storage, sample_submission, mock_nltk_dependencies
):
    submission_id = sample_submission["submission_id"]
    mock_nltk_dependencies["tokenize"].side_effect = lambda text: re.findall(
        r"[A-Za-z]+", text
    )
    mock_nltk_dependencies["pos_tag"].side_effect = lambda tokens: [
        (token, "NNS" if token.lower() in {"cats", "mice"} else "NN")
        for token in tokens
    ]
    lemmatizer = mock_nltk_dependencies["lemmatizer"].return_value
    lemmatizer.lemmatize.side_effect = lambda word, pos: {
        "cats": "cat",
        "mice": "mouse",
        "chased": "chase",
    }.get(word, word)
    sample_submission["results"]["sentences"] = [
        "Cats chase mice swiftly.",
        "The cat chased another mouse.",
        "Dogs bark loudly.",
    ]
    sample_submission["results"]["topics"] = [
        {"name": "Animals>Cats", "sentences": [1, 2]},
        {"name": "Animals>Dogs", "sentences": [3]},
    ]
    mock_storage.get_by_id.return_value = sample_submission

    response = client.get(f"/api/submission/{submission_id}/tag-frequency")

    assert response.status_code == 200
    payload = response.json()
    assert payload["scope_path"] == []
    assert payload["sentence_count"] == 3
    assert payload["rows"][0]["word"] == "cat"
    assert payload["rows"][0]["frequency"] == 2
    assert payload["rows"][0]["topics"] == [
        {"label": "Animals", "full_path": "Animals", "frequency": 2}
    ]


def test_get_tag_frequency_applies_scope_and_orders_topic_links(
    client, mock_storage, sample_submission, mock_nltk_dependencies
):
    submission_id = sample_submission["submission_id"]
    mock_nltk_dependencies["tokenize"].side_effect = lambda text: re.findall(
        r"[A-Za-z]+", text
    )
    mock_nltk_dependencies["pos_tag"].side_effect = lambda tokens: [
        (token, "NNS" if token.lower() in {"cats", "mice"} else "NN")
        for token in tokens
    ]
    lemmatizer = mock_nltk_dependencies["lemmatizer"].return_value
    lemmatizer.lemmatize.side_effect = lambda word, pos: {
        "cats": "cat",
        "mice": "mouse",
        "chased": "chase",
        "models": "model",
    }.get(word, word)
    sample_submission["results"]["sentences"] = [
        "Cats chase mice swiftly.",
        "The cat chased another mouse.",
        "Dogs bark loudly.",
        "Quantum models model reality.",
    ]
    sample_submission["results"]["topics"] = [
        {"name": "Animals>Cats>Indoor", "sentences": [1]},
        {"name": "Animals>Cats>Outdoor", "sentences": [2]},
        {"name": "Animals>Dogs", "sentences": [3]},
        {"name": "Science>Physics", "sentences": [4]},
    ]
    mock_storage.get_by_id.return_value = sample_submission

    response = client.get(
        f"/api/submission/{submission_id}/tag-frequency",
        params=[("path", "Animals"), ("path", "Cats")],
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scope_path"] == ["Animals", "Cats"]
    assert payload["sentence_count"] == 2
    assert payload["rows"][0]["word"] == "cat"
    assert payload["rows"][0]["frequency"] == 2
    assert payload["rows"][0]["topics"] == [
        {"label": "Indoor", "full_path": "Animals>Cats>Indoor", "frequency": 1},
        {"label": "Outdoor", "full_path": "Animals>Cats>Outdoor", "frequency": 1},
    ]
    assert all(row["word"] != "dog" for row in payload["rows"])


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

    response = client.put(
        f"/api/submission/{submission_id}/read-topics",
        json={"read_topics": ["Topic A"]},
    )

    assert response.status_code == 200
    assert response.json()["read_topics"] == ["Topic A"]
    mock_storage.update_read_topics.assert_called_once_with(submission_id, ["Topic A"])


def test_get_global_topics(client, mock_storage):
    mock_storage.aggregate_global_topics.return_value = [
        {"name": "Topic A", "total_sentences": 5}
    ]

    response = client.get("/api/global-topics")

    assert response.status_code == 200
    assert len(response.json()["topics"]) == 1


def test_get_global_topics_sentences(client, mock_storage, sample_submission):
    mock_storage.list_with_projection.return_value = [sample_submission]

    response = client.get(
        "/api/global-topics/sentences", params={"topic_name": ["Topic A"]}
    )

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


def test_get_topic_analysis_heatmap(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    sample_submission["results"]["sentences"] = [
        "Running with cats and dogs.",
        "Dogs keep running fast.",
        "Outside the topic.",
    ]
    sample_submission["results"]["topics"] = [
        {"name": "Topic A", "sentences": [1, 2]},
        {"name": "Topic B", "sentences": [3]},
    ]
    mock_storage.get_by_id.return_value = sample_submission

    with patch("handlers.submission_handler.compute_bigram_heatmap") as mock_heatmap:
        mock_heatmap.return_value = {
            "window_size": 3,
            "words": [
                {
                    "word": "run",
                    "frequency": 2,
                    "specificity_score": 1.25,
                    "outside_topic_frequency": 0,
                }
            ],
            "col_words": [
                {
                    "word": "run",
                    "frequency": 2,
                    "specificity_score": 1.25,
                    "outside_topic_frequency": 0,
                }
            ],
            "matrix": [[2]],
            "max_value": 2,
            "default_visible_word_count": 40,
            "total_word_count": 1,
        }

        response = client.get(
            f"/api/submission/{submission_id}/topic-analysis/heatmap",
            params={"topic_name": "Topic A"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "submission_id": submission_id,
        "scope": "topic",
        "topic_name": "Topic A",
        "window_size": 3,
        "normalization": "lemma",
        "words": [
            {
                "word": "run",
                "frequency": 2,
                "specificity_score": 1.25,
                "outside_topic_frequency": 0,
            }
        ],
        "col_words": [
            {
                "word": "run",
                "frequency": 2,
                "specificity_score": 1.25,
                "outside_topic_frequency": 0,
            }
        ],
        "matrix": [[2]],
        "max_value": 2,
        "default_visible_word_count": 40,
        "total_word_count": 1,
    }
    mock_heatmap.assert_called_once_with(
        ["Running with cats and dogs.", "Dogs keep running fast."],
        ["Outside the topic."],
        window_size=3,
        default_visible_word_count=40,
    )


def test_get_article_analysis_heatmap(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    sample_submission["results"]["sentences"] = [
        "Running with cats and dogs.",
        "Dogs keep running fast.",
        "Outside the topic.",
    ]
    mock_storage.get_by_id.return_value = sample_submission

    with patch("handlers.submission_handler.compute_bigram_heatmap") as mock_heatmap:
        mock_heatmap.return_value = {
            "window_size": 3,
            "words": [
                {
                    "word": "run",
                    "frequency": 2,
                    "specificity_score": 1.25,
                    "outside_topic_frequency": 0,
                }
            ],
            "col_words": [
                {
                    "word": "run",
                    "frequency": 2,
                    "specificity_score": 1.25,
                    "outside_topic_frequency": 0,
                }
            ],
            "matrix": [[0]],
            "max_value": 0,
            "default_visible_word_count": 40,
            "total_word_count": 1,
        }

        response = client.get(
            f"/api/submission/{submission_id}/topic-analysis/heatmap",
            params={"scope": "article"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "submission_id": submission_id,
        "scope": "article",
        "topic_name": None,
        "window_size": 3,
        "normalization": "lemma",
        "words": [
            {
                "word": "run",
                "frequency": 2,
                "specificity_score": 1.25,
                "outside_topic_frequency": 0,
            }
        ],
        "col_words": [
            {
                "word": "run",
                "frequency": 2,
                "specificity_score": 1.25,
                "outside_topic_frequency": 0,
            }
        ],
        "matrix": [[0]],
        "max_value": 0,
        "default_visible_word_count": 40,
        "total_word_count": 1,
    }
    mock_heatmap.assert_called_once_with(
        [
            "Running with cats and dogs.",
            "Dogs keep running fast.",
            "Outside the topic.",
        ],
        [],
        window_size=3,
        default_visible_word_count=40,
    )


def test_get_topic_word_heatmap(client, mock_storage, sample_submission):
    submission_id = sample_submission["submission_id"]
    sample_submission["results"]["sentences"] = [
        "sentence one",
        "sentence two",
        "sentence three",
    ]
    sample_submission["results"]["topics"] = [
        {"name": "Animals", "sentences": [1, 2]},
        {"name": "Birds", "sentences": [3]},
    ]
    mock_storage.get_by_id.return_value = sample_submission

    token_map = {
        "sentence one": ["dog", "cat", "run"],
        "sentence two": ["dog", "run"],
        "sentence three": ["bird", "sing"],
    }

    with patch(
        "handlers.submission_handler.normalize_text_tokens",
        side_effect=lambda text: list(token_map.get(text, [])),
    ):
        response = client.get(
            f"/api/submission/{submission_id}/topic-analysis/topic-word-heatmap",
        )

    assert response.status_code == 200
    body = response.json()
    assert body["submission_id"] == submission_id
    assert body["scope"] == "topic_word"
    assert body["normalization"] == "lemma"
    assert [entry["word"] for entry in body["col_words"]] == ["Animals", "Birds"]
    word_index = {entry["word"]: i for i, entry in enumerate(body["words"])}
    assert set(word_index) == {"dog", "cat", "run", "bird", "sing"}
    # Animals column: dog=2, cat=1, run=2, bird=0, sing=0
    assert body["matrix"][word_index["dog"]] == [2, 0]
    assert body["matrix"][word_index["run"]] == [2, 0]
    assert body["matrix"][word_index["cat"]] == [1, 0]
    assert body["matrix"][word_index["bird"]] == [0, 1]
    assert body["matrix"][word_index["sing"]] == [0, 1]
    assert body["max_value"] == 2
    assert body["total_word_count"] == 5
    assert body["default_visible_word_count"] == 40


def test_get_topic_word_heatmap_skips_topics_without_sentences(
    client, mock_storage, sample_submission
):
    submission_id = sample_submission["submission_id"]
    sample_submission["results"]["sentences"] = ["only sentence"]
    sample_submission["results"]["topics"] = [
        {"name": "Active", "sentences": [1]},
        {"name": "Empty", "sentences": []},
    ]
    mock_storage.get_by_id.return_value = sample_submission

    with patch(
        "handlers.submission_handler.normalize_text_tokens",
        return_value=["alpha", "beta"],
    ):
        response = client.get(
            f"/api/submission/{submission_id}/topic-analysis/topic-word-heatmap",
        )

    assert response.status_code == 200
    body = response.json()
    assert [entry["word"] for entry in body["col_words"]] == ["Active"]


def test_get_topic_analysis_heatmap_returns_404_for_unknown_topic(
    client, mock_storage, sample_submission
):
    submission_id = sample_submission["submission_id"]
    mock_storage.get_by_id.return_value = sample_submission

    response = client.get(
        f"/api/submission/{submission_id}/topic-analysis/heatmap",
        params={"topic_name": "Missing Topic"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Topic not found"


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
        response = client.post(
            "/api/fetch-url", json={"url": "https://example.com/article"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["submission_id"] == submission_id
    assert data["redirect_url"] == f"/page/text/{submission_id}"
    assert mock_storage.create.called
    call_kwargs = mock_storage.create.call_args.kwargs
    assert call_kwargs["source_url"] == "https://example.com/article"
    assert mock_task_queue.create.call_count == 2


def test_fetch_url_pdf(client, mock_storage, mock_task_queue):
    """Fetching a URL that returns a PDF processes it through PDF extraction."""
    submission_id = str(uuid.uuid4())
    mock_storage.create.return_value = {"submission_id": submission_id}

    fake_pdf_bytes = b"%PDF-1.4 fake"
    mock_resp = _make_mock_response(fake_pdf_bytes, "application/pdf")

    fake_html = "<p>PDF content</p>"
    fake_text = "PDF content"

    with (
        patch("handlers.submission_handler.http_requests.get", return_value=mock_resp),
        patch(
            "handlers.submission_handler._extract_content_from_upload",
            return_value=(fake_html, fake_text),
        ) as mock_extract,
    ):
        response = client.post(
            "/api/fetch-url", json={"url": "https://example.com/doc.pdf"}
        )

    assert response.status_code == 200
    mock_extract.assert_called_once_with(
        "document.pdf", fake_pdf_bytes, embed_images=False
    )
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

    with patch(
        "handlers.submission_handler.http_requests.get",
        side_effect=_requests.exceptions.ConnectionError("unreachable"),
    ):
        response = client.post(
            "/api/fetch-url", json={"url": "https://unreachable.example.com"}
        )

    assert response.status_code == 502


def test_fetch_url_unsupported_content_type(client):
    """Binary/unsupported content types are rejected with 415."""
    mock_resp = _make_mock_response(b"\x50\x4b\x03\x04", "application/zip")

    with patch("handlers.submission_handler.http_requests.get", return_value=mock_resp):
        response = client.post(
            "/api/fetch-url", json={"url": "https://example.com/archive.zip"}
        )

    assert response.status_code == 415
