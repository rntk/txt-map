"""
Unit tests for the LlamaCPP module.

Tests LLamaCPP class: __init__, estimate_tokens, call, get_connection, embeddings, rerank
Tests URL parsing, default values, environment variables
Tests request/response formats for chat, embeddings, rerank
Mocks: http.client, urlparse, json, os.getenv, logging
Tests edge cases: empty texts, long prompts, server unavailable, SSL errors
"""

import pytest
from unittest.mock import MagicMock, patch
import json


# =============================================================================
# Import the module under test
# =============================================================================

from lib.llm.llamacpp import LLamaCPP
from lib.llm.base import LLMMessage, ToolCall, ToolDefinition


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture(autouse=True)
def reset_environment():
    """Reset environment and clear mocks before each test."""
    with patch("lib.llm.llamacpp.os.getenv") as mock_getenv:
        mock_getenv.return_value = None  # Default: no TOKEN env var
        yield mock_getenv


@pytest.fixture
def mock_http_connection():
    """Create a mock HTTPConnection."""
    with patch("lib.llm.llamacpp.HTTPConnection") as mock_conn:
        mock_instance = MagicMock()
        mock_conn.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_https_connection():
    """Create a mock HTTPSConnection."""
    with patch("lib.llm.llamacpp.HTTPSConnection") as mock_conn:
        mock_instance = MagicMock()
        mock_conn.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_urlparse():
    """Create a mock urlparse."""
    with patch("lib.llm.llamacpp.urlparse") as mock_parse:
        yield mock_parse


@pytest.fixture
def mock_json_dumps():
    """Mock json.dumps."""
    with patch("lib.llm.llamacpp.json.dumps") as mock_dumps:
        mock_dumps.side_effect = json.dumps
        yield mock_dumps


@pytest.fixture
def mock_json_loads():
    """Mock json.loads."""
    with patch("lib.llm.llamacpp.json.loads") as mock_loads:
        mock_loads.side_effect = json.loads
        yield mock_loads


@pytest.fixture
def mock_logging():
    """Mock logging module."""
    with patch("lib.llm.llamacpp.logging") as mock_log:
        yield mock_log


# =============================================================================
# Test: __init__ method
# =============================================================================


class TestLlamaCPPInit:
    """Tests for LLamaCPP.__init__ method."""

    def test_parses_http_url_correctly(self, mock_urlparse, reset_environment):
        """Parses HTTP URL correctly."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        mock_urlparse.return_value = mock_parsed

        llm = LLamaCPP("http://localhost:8989")

        mock_urlparse.assert_called_once_with("http://localhost:8989")
        assert llm._LLamaCPP__host == "localhost:8989"
        assert llm._LLamaCPP__is_https is False

    def test_parses_https_url_correctly(self, mock_urlparse, reset_environment):
        """Parses HTTPS URL correctly."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "example.com"
        mock_parsed.scheme = "https"
        mock_urlparse.return_value = mock_parsed

        llm = LLamaCPP("https://example.com")

        assert llm._LLamaCPP__host == "example.com"
        assert llm._LLamaCPP__is_https is True

    def test_parses_ip_address_url(self, mock_urlparse, reset_environment):
        """Parses IP address URL correctly."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "192.168.1.1:8080"
        mock_parsed.scheme = "http"
        mock_urlparse.return_value = mock_parsed

        llm = LLamaCPP("http://192.168.1.1:8080")

        assert llm._LLamaCPP__host == "192.168.1.1:8080"
        assert llm._LLamaCPP__is_https is False

    def test_stores_max_context_tokens_default(self, mock_urlparse, reset_environment):
        """Stores default max_context_tokens (11000)."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        mock_urlparse.return_value = mock_parsed

        llm = LLamaCPP("http://localhost:8989")

        assert llm.max_context_tokens == 11000

    def test_stores_max_context_tokens_custom(self, mock_urlparse, reset_environment):
        """Stores custom max_context_tokens."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        mock_urlparse.return_value = mock_parsed

        llm = LLamaCPP("http://localhost:8989", max_context_tokens=5000)

        assert llm.max_context_tokens == 5000

    def test_uses_provided_token(self, mock_urlparse, reset_environment):
        """Uses provided token."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        mock_urlparse.return_value = mock_parsed

        llm = LLamaCPP("http://localhost:8989", token="my-secret-token")

        assert llm._LLamaCPP__token == "my-secret-token"

    def test_falls_back_to_token_env_var(self, mock_urlparse, reset_environment):
        """Falls back to TOKEN environment variable."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        mock_urlparse.return_value = mock_parsed
        reset_environment.return_value = "env-token"

        llm = LLamaCPP("http://localhost:8989")

        reset_environment.assert_called_with("TOKEN")
        assert llm._LLamaCPP__token == "env-token"

    def test_provided_token_takes_precedence_over_env(
        self, mock_urlparse, reset_environment
    ):
        """Provided token takes precedence over environment variable."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        mock_urlparse.return_value = mock_parsed
        reset_environment.return_value = "env-token"

        llm = LLamaCPP("http://localhost:8989", token="provided-token")

        assert llm._LLamaCPP__token == "provided-token"

    def test_token_is_none_when_not_provided_and_not_in_env(
        self, mock_urlparse, reset_environment
    ):
        """Token is None when not provided and not in environment."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        mock_urlparse.return_value = mock_parsed
        reset_environment.return_value = None

        llm = LLamaCPP("http://localhost:8989")

        assert llm._LLamaCPP__token is None

    def test_detects_https_scheme_case_insensitive(
        self, mock_urlparse, reset_environment
    ):
        """Detects HTTPS scheme case-insensitively."""
        mock_parsed = MagicMock()
        mock_parsed.netloc = "example.com"
        mock_parsed.scheme = "HTTPS"  # Uppercase
        mock_urlparse.return_value = mock_parsed

        llm = LLamaCPP("HTTPS://example.com")

        assert llm._LLamaCPP__is_https is True


# =============================================================================
# Test: estimate_tokens method
# =============================================================================


class TestEstimateTokens:
    """Tests for LLamaCPP.estimate_tokens method."""

    def setup_method(self):
        """Set up test fixtures."""
        with patch("lib.llm.llamacpp.urlparse") as mock_parse:
            mock_parsed = MagicMock()
            mock_parsed.netloc = "localhost:8989"
            mock_parsed.scheme = "http"
            mock_parse.return_value = mock_parsed
            self.llm = LLamaCPP("http://localhost:8989")


class TestReasoningExtraction:
    """Tests for LLamaCPP reasoning extraction."""

    def setup_method(self) -> None:
        with patch("lib.llm.llamacpp.urlparse") as mock_parse:
            mock_parsed = MagicMock()
            mock_parsed.netloc = "localhost:8989"
            mock_parsed.scheme = "http"
            mock_parse.return_value = mock_parsed
            self.llm = LLamaCPP("http://localhost:8989")

    def test_extracts_reasoning_from_structured_fields(self) -> None:
        response_payload = {
            "choices": [
                {
                    "message": {
                        "reasoning_content": "first trace",
                        "thinking": "second trace",
                        "content": "final answer",
                    }
                }
            ]
        }

        reasoning, content = self.llm._extract_reasoning_and_content(response_payload)

        assert reasoning == "first trace\n\nsecond trace"
        assert content == "final answer"

    def test_extracts_reasoning_from_think_tags_and_cleans_content(self) -> None:
        response_payload = {
            "choices": [
                {
                    "message": {
                        "content": "<think>hidden reasoning</think>\nVisible answer",
                    }
                }
            ]
        }

        reasoning, content = self.llm._extract_reasoning_and_content(response_payload)

        assert reasoning == "hidden reasoning"
        assert content == "Visible answer"

    def test_returns_len_text_div_4(self):
        """Returns len(text) // 4."""
        text = "Hello World"  # 11 characters
        result = self.llm.estimate_tokens(text)
        assert result == 11 // 4  # 2

    def test_empty_string_returns_0(self):
        """Empty string returns 0."""
        result = self.llm.estimate_tokens("")
        assert result == 0

    def test_handles_unicode_characters(self):
        """Handles Unicode characters."""
        text = "Hello \u4e16\u754c"  # Hello + 2 Chinese chars = 8 chars
        result = self.llm.estimate_tokens(text)
        assert result == 8 // 4  # 2

    def test_single_character_returns_0(self):
        """Single character returns 0 (1 // 4 = 0)."""
        result = self.llm.estimate_tokens("a")
        assert result == 0

    def test_four_characters_returns_1(self):
        """Four characters returns 1."""
        result = self.llm.estimate_tokens("abcd")
        assert result == 1

    def test_long_text_estimation(self):
        """Long text estimation."""
        text = "a" * 400  # 400 characters
        result = self.llm.estimate_tokens(text)
        assert result == 100


# =============================================================================
# Test: get_connection method
# =============================================================================


class TestGetConnection:
    """Tests for LLamaCPP.get_connection method."""

    def test_returns_https_connection_for_https_urls(self):
        """Returns HTTPSConnection for HTTPS URLs."""
        with (
            patch("lib.llm.llamacpp.urlparse") as mock_parse,
            patch("lib.llm.llamacpp.HTTPSConnection") as mock_https,
        ):
            mock_parsed = MagicMock()
            mock_parsed.netloc = "example.com"
            mock_parsed.scheme = "https"
            mock_parse.return_value = mock_parsed
            mock_conn_instance = MagicMock()
            mock_https.return_value = mock_conn_instance

            llm = LLamaCPP("https://example.com")
            conn = llm.get_connection()

            mock_https.assert_called_once_with("example.com")
            assert conn is mock_conn_instance

    def test_returns_http_connection_for_http_urls(self):
        """Returns HTTPConnection for HTTP URLs."""
        with (
            patch("lib.llm.llamacpp.urlparse") as mock_parse,
            patch("lib.llm.llamacpp.HTTPConnection") as mock_http,
        ):
            mock_parsed = MagicMock()
            mock_parsed.netloc = "localhost:8989"
            mock_parsed.scheme = "http"
            mock_parse.return_value = mock_parsed
            mock_conn_instance = MagicMock()
            mock_http.return_value = mock_conn_instance

            llm = LLamaCPP("http://localhost:8989")
            conn = llm.get_connection()

            mock_http.assert_called_once_with("localhost:8989")
            assert conn is mock_conn_instance

    def test_uses_stored_host(self):
        """Uses stored host for connection."""
        with (
            patch("lib.llm.llamacpp.urlparse") as mock_parse,
            patch("lib.llm.llamacpp.HTTPConnection") as mock_http,
        ):
            mock_parsed = MagicMock()
            mock_parsed.netloc = "custom-host:9999"
            mock_parsed.scheme = "http"
            mock_parse.return_value = mock_parsed
            mock_conn_instance = MagicMock()
            mock_http.return_value = mock_conn_instance

            llm = LLamaCPP("http://custom-host:9999")
            llm.get_connection()

            mock_http.assert_called_once_with("custom-host:9999")


# =============================================================================
# Test: call method
# =============================================================================


class TestCall:
    """Tests for LLamaCPP.call method."""

    def _create_llm_with_mocks(self):
        """Helper to create LLM with proper mocks."""
        urlparse_patch = patch("lib.llm.llamacpp.urlparse")
        http_patch = patch("lib.llm.llamacpp.HTTPConnection")

        mock_parse = urlparse_patch.start()
        mock_http = http_patch.start()

        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        mock_parse.return_value = mock_parsed

        mock_conn_instance = MagicMock()
        mock_http.return_value = mock_conn_instance

        llm = LLamaCPP("http://localhost:8989")

        return llm, mock_conn_instance, urlparse_patch, http_patch

    def test_post_to_v1_chat_completions(self):
        """POST to /v1/chat/completions."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "Hello!"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            llm.call(["Hello"])

            mock_conn.request.assert_called_once()
            call_args = mock_conn.request.call_args
            assert call_args[0][0] == "POST"
            assert call_args[0][1] == "/v1/chat/completions"
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_request_model_moonshotai_kimi_k2_5(self):
        """Request uses model 'moonshotai/Kimi-K2.5'."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "Hello!"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            llm.call(["Hello"])

            call_args = mock_conn.request.call_args
            body = json.loads(call_args[0][2])
            assert body["model"] == "moonshotai/Kimi-K2.5"
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_request_uses_first_user_message(self):
        """Request uses first element of user_msgs."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "Response"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            llm.call(["First message", "Second message"])

            call_args = mock_conn.request.call_args
            body = json.loads(call_args[0][2])
            assert body["messages"][0]["content"] == "First message"
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_request_default_temperature_0(self):
        """Request uses default temperature 0.0."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "Hello!"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            llm.call(["Hello"])

            call_args = mock_conn.request.call_args
            body = json.loads(call_args[0][2])
            assert body["temperature"] == 0.0
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_request_custom_temperature(self):
        """Request uses custom temperature."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "Hello!"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            llm.call(["Hello"], temperature=0.7)

            call_args = mock_conn.request.call_args
            body = json.loads(call_args[0][2])
            assert body["temperature"] == 0.7
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_request_cache_prompt_true(self):
        """Request sets cache_prompt to True."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "Hello!"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            llm.call(["Hello"])

            call_args = mock_conn.request.call_args
            body = json.loads(call_args[0][2])
            assert body["cache_prompt"] is True
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_request_content_type_header(self):
        """Request includes Content-type: application/json header."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "Hello!"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            llm.call(["Hello"])

            call_args = mock_conn.request.call_args
            headers = call_args[0][3]
            assert headers["Content-type"] == "application/json"
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_request_includes_auth_header_when_token_set(self):
        """Request includes Authorization header when token is set."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "Hello!"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            llm._LLamaCPP__token = "test-token"
            llm.call(["Hello"])

            call_args = mock_conn.request.call_args
            headers = call_args[0][3]
            assert headers["Authorization"] == "Bearer test-token"
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_request_no_auth_header_when_token_not_set(self):
        """Request does not include Authorization header when token is not set."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "Hello!"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            llm._LLamaCPP__token = None
            llm.call(["Hello"])

            call_args = mock_conn.request.call_args
            headers = call_args[0][3]
            assert "Authorization" not in headers
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_response_status_200_extracts_content(self):
        """Response status 200: extracts response content."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {"choices": [{"message": {"content": "The answer is 42"}}]}
            )
            mock_conn.getresponse.return_value = mock_response

            result = llm.call(["What is the answer?"])

            assert result == "The answer is 42"
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_response_status_error_logs_and_returns_error_message(self, mock_logging):
        """Response status != 200: logs error, raises RuntimeError."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 500
            mock_response.reason = "Internal Server Error"
            mock_response.read.return_value = b'{"error": "Something went wrong"}'
            mock_conn.getresponse.return_value = mock_response

            with pytest.raises(RuntimeError):
                llm.call(["Hello"])
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_response_parses_json(self):
        """Response parses JSON."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            response_body = {"choices": [{"message": {"content": "Hello!"}}]}
            mock_response.read.return_value = json.dumps(response_body)
            mock_conn.getresponse.return_value = mock_response

            llm.call(["Hello"])

            # If we get here without exception, JSON was parsed
            assert mock_conn.getresponse.called
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_extracts_choices_0_message_content(self):
        """Extracts choices[0].message.content."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            response_body = {
                "choices": [{"message": {"content": "Specific response content"}}]
            }
            mock_response.read.return_value = json.dumps(response_body)
            mock_conn.getresponse.return_value = mock_response

            result = llm.call(["Hello"])

            assert result == "Specific response content"
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_handles_connection_error(self, mock_logging):
        """Handles connection errors."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_conn.request.side_effect = ConnectionError("Connection refused")

            with pytest.raises(RuntimeError, match="Connection refused"):
                llm.call(["Hello"])
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_handles_timeout_error(self, mock_logging):
        """Handles timeout errors."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_conn.request.side_effect = TimeoutError("Request timed out")

            with pytest.raises(RuntimeError, match="timed out"):
                llm.call(["Hello"])
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_handles_invalid_json_response(self, mock_logging):
        """Handles invalid JSON response."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = b"invalid json {"
            mock_conn.getresponse.return_value = mock_response

            with pytest.raises(RuntimeError, match="JSON"):
                llm.call(["Hello"])
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_handles_missing_response_fields(self):
        """Handles missing response fields."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            response_body = {"choices": []}  # Empty choices
            mock_response.read.return_value = json.dumps(response_body)
            mock_conn.getresponse.return_value = mock_response

            with pytest.raises(RuntimeError):
                llm.call(["Hello"])
        finally:
            up_patch.stop()
            http_patch.stop()

    def test_handles_missing_message_field(self):
        """Handles missing message field in response."""
        llm, mock_conn, up_patch, http_patch = self._create_llm_with_mocks()
        try:
            mock_response = MagicMock()
            mock_response.status = 200
            response_body = {"choices": [{"not_message": "wrong"}]}
            mock_response.read.return_value = json.dumps(response_body)
            mock_conn.getresponse.return_value = mock_response

            with pytest.raises(RuntimeError):
                llm.call(["Hello"])
        finally:
            up_patch.stop()
            http_patch.stop()


# =============================================================================
# Test: embeddings method
# =============================================================================


class TestEmbeddings:
    """Tests for LLamaCPP.embeddings method."""

    def setup_method(self):
        """Set up test fixtures."""
        self.patch_urlparse = patch("lib.llm.llamacpp.urlparse")
        self.mock_parse = self.patch_urlparse.start()
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        self.mock_parse.return_value = mock_parsed

        self.patch_http = patch("lib.llm.llamacpp.HTTPConnection")
        self.mock_http = self.patch_http.start()
        self.mock_conn_instance = MagicMock()
        self.mock_http.return_value = self.mock_conn_instance

        self.llm = LLamaCPP("http://localhost:8989")

    def teardown_method(self):
        """Tear down test fixtures."""
        self.patch_urlparse.stop()
        self.patch_http.stop()

    def test_post_to_v1_embeddings(self):
        """POST to /v1/embeddings."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"data": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.embeddings(["text"])

        self.mock_conn_instance.request.assert_called_once()
        call_args = self.mock_conn_instance.request.call_args
        assert call_args[0][0] == "POST"
        assert call_args[0][1] == "/v1/embeddings"

    def test_request_model_text_embedding_3_small(self):
        """Request uses model 'text-embedding-3-small'."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"data": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.embeddings(["text"])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["model"] == "text-embedding-3-small"

    def test_request_encoding_format_float(self):
        """Request sets encoding_format to 'float'."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"data": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.embeddings(["text"])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["encoding_format"] == "float"

    def test_request_input_is_list_of_texts(self):
        """Request input is list of texts."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"data": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.embeddings(["text1", "text2", "text3"])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["input"] == ["text1", "text2", "text3"]

    def test_request_content_type_header(self):
        """Request includes Content-type: application/json header."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"data": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.embeddings(["text"])

        call_args = self.mock_conn_instance.request.call_args
        headers = call_args[0][3]
        assert headers["Content-type"] == "application/json"

    def test_request_includes_auth_header_when_token_set(self):
        """Request includes Authorization header when token is set."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"data": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm._LLamaCPP__token = "embed-token"
        self.llm.embeddings(["text"])

        call_args = self.mock_conn_instance.request.call_args
        headers = call_args[0][3]
        assert headers["Authorization"] == "Bearer embed-token"

    def test_response_status_200_extracts_embeddings(self):
        """Response status 200: extracts embeddings list."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {
            "data": [{"embedding": [0.1, 0.2, 0.3]}, {"embedding": [0.4, 0.5, 0.6]}]
        }
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.embeddings(["text1", "text2"])

        assert result == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    def test_response_status_error_logs_and_returns_none(self, mock_logging):
        """Response status != 200: logs error, returns None."""
        mock_response = MagicMock()
        mock_response.status = 400
        mock_response.reason = "Bad Request"
        mock_response.read.return_value = b'{"error": "Invalid input"}'
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.embeddings(["text"])

        mock_logging.error.assert_called_once()
        assert result is None

    def test_handles_empty_data_array(self):
        """Handles empty data array."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {"data": []}
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.embeddings([])

        assert result == []

    def test_handles_connection_error(self, mock_logging):
        """Handles connection errors by returning None."""
        self.mock_conn_instance.request.side_effect = ConnectionError(
            "Connection refused"
        )

        result = self.llm.embeddings(["text"])

        assert result is None
        mock_logging.error.assert_called()

    def test_handles_invalid_json_response(self, mock_logging):
        """Handles invalid JSON response by returning None."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b"invalid json {"
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.embeddings(["text"])

        assert result is None
        mock_logging.error.assert_called()

    def test_empty_texts_list(self):
        """Empty texts list sends empty input array."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {"data": []}
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.embeddings([])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["input"] == []
        assert result == []


# =============================================================================
# Test: rerank method
# =============================================================================


class TestRerank:
    """Tests for LLamaCPP.rerank method."""

    def setup_method(self):
        """Set up test fixtures."""
        self.patch_urlparse = patch("lib.llm.llamacpp.urlparse")
        self.mock_parse = self.patch_urlparse.start()
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        self.mock_parse.return_value = mock_parsed

        self.patch_http = patch("lib.llm.llamacpp.HTTPConnection")
        self.mock_http = self.patch_http.start()
        self.mock_conn_instance = MagicMock()
        self.mock_http.return_value = self.mock_conn_instance

        self.llm = LLamaCPP("http://localhost:8989")

    def teardown_method(self):
        """Tear down test fixtures."""
        self.patch_urlparse.stop()
        self.patch_http.stop()

    def test_post_to_v1_rerank(self):
        """POST to /v1/rerank."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"results": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.rerank("query", ["doc1", "doc2"])

        self.mock_conn_instance.request.assert_called_once()
        call_args = self.mock_conn_instance.request.call_args
        assert call_args[0][0] == "POST"
        assert call_args[0][1] == "/v1/rerank"

    def test_request_includes_query(self):
        """Request includes query string."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"results": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.rerank("test query", ["doc1"])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["query"] == "test query"

    def test_request_includes_documents(self):
        """Request includes documents list."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"results": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.rerank("query", ["doc1", "doc2", "doc3"])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["documents"] == ["doc1", "doc2", "doc3"]

    def test_request_includes_top_n_when_provided(self):
        """Request includes top_n when provided."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"results": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.rerank("query", ["doc1", "doc2"], top_n=5)

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["top_n"] == 5

    def test_request_omits_top_n_when_none(self):
        """Request omits top_n when None."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"results": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.rerank("query", ["doc1"], top_n=None)

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert "top_n" not in body

    def test_request_content_type_header(self):
        """Request includes Content-type: application/json header."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"results": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.rerank("query", ["doc1"])

        call_args = self.mock_conn_instance.request.call_args
        headers = call_args[0][3]
        assert headers["Content-type"] == "application/json"

    def test_request_includes_auth_header_when_token_set(self):
        """Request includes Authorization header when token is set."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({"results": []})
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm._LLamaCPP__token = "rerank-token"
        self.llm.rerank("query", ["doc1"])

        call_args = self.mock_conn_instance.request.call_args
        headers = call_args[0][3]
        assert headers["Authorization"] == "Bearer rerank-token"

    def test_response_status_200_extracts_results(self):
        """Response status 200: extracts results list."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {
            "results": [
                {"document": "doc1", "index": 0, "relevance_score": 0.9},
                {"document": "doc2", "index": 1, "relevance_score": 0.7},
            ]
        }
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", ["doc1", "doc2"])

        assert result == [
            {"document": "doc1", "index": 0, "relevance_score": 0.9},
            {"document": "doc2", "index": 1, "relevance_score": 0.7},
        ]

    def test_response_status_error_logs_and_returns_none(self, mock_logging):
        """Response status != 200: logs error, returns None."""
        mock_response = MagicMock()
        mock_response.status = 500
        mock_response.reason = "Internal Server Error"
        mock_response.read.return_value = b'{"error": "Server error"}'
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", ["doc1"])

        mock_logging.error.assert_called_once()
        assert result is None

    def test_handles_connection_error(self, mock_logging):
        """Handles connection errors by returning None."""
        self.mock_conn_instance.request.side_effect = ConnectionError(
            "Connection refused"
        )

        result = self.llm.rerank("query", ["doc1"])

        assert result is None
        mock_logging.error.assert_called()

    def test_handles_invalid_json_response(self, mock_logging):
        """Handles invalid JSON response by returning None."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b"invalid json {"
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", ["doc1"])

        assert result is None
        mock_logging.error.assert_called()

    def test_handles_missing_results_key_returns_empty_list(self):
        """Handles missing results key (returns empty list via .get())."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {"not_results": []}
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", ["doc1"])

        assert result == []

    def test_empty_documents_list(self):
        """Empty documents list."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {"results": []}
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", [])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["documents"] == []
        assert result == []

    def test_result_structure_document_field(self):
        """Result includes document field."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {
            "results": [
                {"document": "original doc text", "index": 0, "relevance_score": 0.95}
            ]
        }
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", ["original doc text"])

        assert result[0]["document"] == "original doc text"

    def test_result_structure_index_field(self):
        """Result includes index field."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {
            "results": [{"document": "doc", "index": 2, "relevance_score": 0.8}]
        }
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", ["doc1", "doc2", "doc"])

        assert result[0]["index"] == 2

    def test_result_structure_relevance_score_field(self):
        """Result includes relevance_score field."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {
            "results": [{"document": "doc", "index": 0, "relevance_score": 0.85}]
        }
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", ["doc"])

        assert result[0]["relevance_score"] == 0.85


# =============================================================================
# Test: Edge Cases and Error Handling
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def setup_method(self):
        """Set up test fixtures."""
        self.patch_urlparse = patch("lib.llm.llamacpp.urlparse")
        self.mock_parse = self.patch_urlparse.start()
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        self.mock_parse.return_value = mock_parsed

        self.patch_http = patch("lib.llm.llamacpp.HTTPConnection")
        self.mock_http = self.patch_http.start()
        self.mock_conn_instance = MagicMock()
        self.mock_http.return_value = self.mock_conn_instance

        self.llm = LLamaCPP("http://localhost:8989")

    def teardown_method(self):
        """Tear down test fixtures."""
        self.patch_urlparse.stop()
        self.patch_http.stop()

    def test_server_unavailable_connection_refused(self):
        """Server unavailable: connection refused."""
        self.mock_conn_instance.request.side_effect = ConnectionRefusedError(
            "Connection refused"
        )

        with pytest.raises(RuntimeError, match="Connection refused"):
            self.llm.call(["Hello"])

    def test_server_unavailable_timeout(self):
        """Server unavailable: timeout."""
        self.mock_conn_instance.getresponse.side_effect = TimeoutError(
            "Connection timed out"
        )

        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "OK"}}]}
        )
        self.mock_conn_instance.request.side_effect = None
        self.mock_conn_instance.getresponse.side_effect = TimeoutError(
            "Connection timed out"
        )

        with pytest.raises(RuntimeError, match="timed out"):
            self.llm.call(["Hello"])

    def test_ssl_certificate_error(self):
        """SSL certificate error for HTTPS."""
        self.patch_urlparse.stop()
        self.patch_http.stop()

        # Create new mocks for HTTPS
        with patch("lib.llm.llamacpp.urlparse") as mock_parse:
            mock_parsed = MagicMock()
            mock_parsed.netloc = "secure.example.com"
            mock_parsed.scheme = "https"
            mock_parse.return_value = mock_parsed

            with patch("lib.llm.llamacpp.HTTPSConnection") as mock_https:
                mock_https.side_effect = Exception("SSL: CERTIFICATE_VERIFY_FAILED")

                llm = LLamaCPP("https://secure.example.com")

                with pytest.raises(Exception, match="CERTIFICATE_VERIFY_FAILED"):
                    llm.call(["Hello"])

    def test_very_long_prompt(self):
        """Very long prompt handling."""
        long_text = "a" * 50000  # 50KB prompt
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "Response to long prompt"}}]}
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.call([long_text])

        # Verify request was made with long text
        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert len(body["messages"][0]["content"]) == 50000
        assert result == "Response to long prompt"

    def test_empty_user_message(self):
        """Empty user message."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "Response"}}]}
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.call([""])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["messages"][0]["content"] == ""
        assert result == "Response"

    def test_rate_limiting_429_response(self, mock_logging):
        """Rate limiting: 429 response."""
        mock_response = MagicMock()
        mock_response.status = 429
        mock_response.reason = "Too Many Requests"
        mock_response.read.return_value = b'{"error": "Rate limit exceeded"}'
        self.mock_conn_instance.getresponse.return_value = mock_response

        with pytest.raises(RuntimeError):
            self.llm.call(["Hello"])

    def test_http_401_unauthorized(self, mock_logging):
        """HTTP 401 Unauthorized response."""
        mock_response = MagicMock()
        mock_response.status = 401
        mock_response.reason = "Unauthorized"
        mock_response.read.return_value = b'{"error": "Invalid token"}'
        self.mock_conn_instance.getresponse.return_value = mock_response

        with pytest.raises(RuntimeError):
            self.llm.call(["Hello"])

    def test_http_404_not_found(self, mock_logging):
        """HTTP 404 Not Found response."""
        mock_response = MagicMock()
        mock_response.status = 404
        mock_response.reason = "Not Found"
        mock_response.read.return_value = b'{"error": "Endpoint not found"}'
        self.mock_conn_instance.getresponse.return_value = mock_response

        with pytest.raises(RuntimeError):
            self.llm.call(["Hello"])

    def test_special_characters_in_text(self):
        """Special characters in text."""
        special_text = "Hello! @#$%^&*() \u4e16\u754c \u00e9\u00e8\u00ea"
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "Response"}}]}
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.call([special_text])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["messages"][0]["content"] == special_text

    def test_newlines_in_text(self):
        """Newlines in text."""
        text_with_newlines = "Line 1\nLine 2\nLine 3"
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "Response"}}]}
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.call([text_with_newlines])

        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["messages"][0]["content"] == text_with_newlines

    def test_multiple_embeddings_batch(self):
        """Multiple embeddings in batch."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {
            "data": [
                {"embedding": [0.1] * 1536},
                {"embedding": [0.2] * 1536},
                {"embedding": [0.3] * 1536},
            ]
        }
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.embeddings(["text1", "text2", "text3"])

        assert len(result) == 3
        assert len(result[0]) == 1536

    def test_rerank_with_many_documents(self):
        """Rerank with many documents."""
        docs = [f"Document {i}" for i in range(100)]
        mock_response = MagicMock()
        mock_response.status = 200
        results = [
            {"document": f"Document {i}", "index": i, "relevance_score": 1.0 - i * 0.01}
            for i in range(100)
        ]
        mock_response.read.return_value = json.dumps({"results": results})
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", docs)

        assert len(result) == 100

    def test_rerank_top_n_limits_results(self):
        """Rerank with top_n limits results."""
        docs = ["doc1", "doc2", "doc3", "doc4", "doc5"]
        mock_response = MagicMock()
        mock_response.status = 200
        # Server should return top_n results
        results = [
            {"document": f"doc{i + 1}", "index": i, "relevance_score": 1.0 - i * 0.1}
            for i in range(3)
        ]
        mock_response.read.return_value = json.dumps({"results": results})
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank("query", docs, top_n=3)

        # Request should include top_n
        call_args = self.mock_conn_instance.request.call_args
        body = json.loads(call_args[0][2])
        assert body["top_n"] == 3
        assert len(result) == 3


# =============================================================================
# Test: Integration Scenarios
# =============================================================================


class TestIntegrationScenarios:
    """Integration scenario tests."""

    def setup_method(self):
        """Set up test fixtures."""
        self.patch_urlparse = patch("lib.llm.llamacpp.urlparse")
        self.mock_parse = self.patch_urlparse.start()
        mock_parsed = MagicMock()
        mock_parsed.netloc = "localhost:8989"
        mock_parsed.scheme = "http"
        self.mock_parse.return_value = mock_parsed

        self.patch_http = patch("lib.llm.llamacpp.HTTPConnection")
        self.mock_http = self.patch_http.start()
        self.mock_conn_instance = MagicMock()
        self.mock_http.return_value = self.mock_conn_instance

        self.llm = LLamaCPP("http://localhost:8989", token="test-token")

    def teardown_method(self):
        """Tear down test fixtures."""
        self.patch_urlparse.stop()
        self.patch_http.stop()

    def test_full_chat_workflow(self):
        """Full chat workflow: init -> call -> parse response."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {
            "id": "chatcmpl-123",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "The capital of France is Paris.",
                    }
                }
            ],
        }
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.call(["What is the capital of France?"])

        assert result == "The capital of France is Paris."

    def test_full_embeddings_workflow(self):
        """Full embeddings workflow: init -> embeddings -> parse response."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {
            "data": [
                {"index": 0, "embedding": [0.01, 0.02, 0.03]},
                {"index": 1, "embedding": [0.04, 0.05, 0.06]},
            ],
            "usage": {"total_tokens": 10},
        }
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.embeddings(["text1", "text2"])

        assert len(result) == 2
        assert result[0] == [0.01, 0.02, 0.03]
        assert result[1] == [0.04, 0.05, 0.06]

    def test_full_rerank_workflow(self):
        """Full rerank workflow: init -> rerank -> parse response."""
        mock_response = MagicMock()
        mock_response.status = 200
        response_body = {
            "results": [
                {
                    "document": "Paris is the capital",
                    "index": 1,
                    "relevance_score": 0.95,
                },
                {
                    "document": "France country info",
                    "index": 0,
                    "relevance_score": 0.75,
                },
            ]
        }
        mock_response.read.return_value = json.dumps(response_body)
        self.mock_conn_instance.getresponse.return_value = mock_response

        result = self.llm.rerank(
            "capital of France", ["France country info", "Paris is the capital"]
        )

        assert len(result) == 2
        assert result[0]["relevance_score"] > result[1]["relevance_score"]

    def test_token_authentication_in_all_methods(self):
        """Token authentication included in all methods."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "OK"}}]}
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        # Test call
        self.llm.call(["test"])
        call_headers = self.mock_conn_instance.request.call_args[0][3]
        assert call_headers["Authorization"] == "Bearer test-token"

        # Test embeddings
        mock_response.read.return_value = json.dumps({"data": []})
        self.llm.embeddings(["test"])
        embed_headers = self.mock_conn_instance.request.call_args[0][3]
        assert embed_headers["Authorization"] == "Bearer test-token"

        # Test rerank
        mock_response.read.return_value = json.dumps({"results": []})
        self.llm.rerank("query", ["doc"])
        rerank_headers = self.mock_conn_instance.request.call_args[0][3]
        assert rerank_headers["Authorization"] == "Bearer test-token"

    def test_complete_sends_tools_and_history(self):
        """Tool-aware complete serializes messages and tool definitions."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "done"}}]}
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        tool = ToolDefinition(
            name="lookup",
            description="Look up data",
            parameters={"type": "object"},
        )

        response = self.llm.complete(
            user_prompt="final question",
            system_prompt="system text",
            tools=(tool,),
            messages=(
                LLMMessage(
                    role="assistant",
                    content="working",
                    tool_calls=(
                        ToolCall(name="lookup", arguments={"id": 1}, id="call-1"),
                    ),
                ),
                LLMMessage(role="tool", content='{"id":1}', tool_call_id="call-1"),
            ),
            tool_choice="required",
            parallel_tool_calls=True,
        )

        assert response.content == "done"
        body = json.loads(self.mock_conn_instance.request.call_args[0][2])
        assert body["messages"][0]["role"] == "system"
        assert body["messages"][1]["tool_calls"][0]["function"]["name"] == "lookup"
        assert body["messages"][2]["tool_call_id"] == "call-1"
        assert body["messages"][3]["role"] == "user"
        assert body["tools"][0]["function"]["name"] == "lookup"
        assert body["tool_choice"] == "required"
        assert body["parallel_tool_calls"] is True

    def test_complete_sends_reasoning_content_in_history(self):
        """Assistant messages with reasoning include reasoning_content."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "done"}}]}
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        self.llm.complete(
            user_prompt="final question",
            system_prompt="system text",
            messages=(
                LLMMessage(
                    role="assistant",
                    content="thinking",
                    reasoning="internal reasoning trace",
                    tool_calls=(
                        ToolCall(name="lookup", arguments={"id": 1}, id="call-1"),
                    ),
                ),
                LLMMessage(role="tool", content='{"id":1}', tool_call_id="call-1"),
            ),
        )

        body = json.loads(self.mock_conn_instance.request.call_args[0][2])
        assistant_msg = body["messages"][1]
        assert assistant_msg["role"] == "assistant"
        assert assistant_msg["reasoning_content"] == "internal reasoning trace"
        assert assistant_msg["tool_calls"][0]["function"]["name"] == "lookup"

    def test_complete_combines_system_prompt_and_system_messages(self):
        """System prompt content is sent as a single leading system message."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "done"}}]}
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        response = self.llm.complete(
            user_prompt="final question",
            system_prompt="system text",
            messages=(
                LLMMessage(role="system", content="history system text"),
                LLMMessage(role="assistant", content="working"),
            ),
        )

        assert response.content == "done"
        body = json.loads(self.mock_conn_instance.request.call_args[0][2])
        assert body["messages"] == [
            {"role": "system", "content": "system text\n\nhistory system text"},
            {"role": "assistant", "content": "working"},
            {"role": "user", "content": "final question"},
        ]

    def test_complete_parses_tool_only_response(self):
        """Tool-only llama.cpp responses are returned by complete()."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {
                "choices": [
                    {
                        "message": {
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call-1",
                                    "type": "function",
                                    "function": {
                                        "name": "lookup",
                                        "arguments": '{"city":"Paris"}',
                                    },
                                }
                            ],
                        }
                    }
                ]
            }
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        response = self.llm.complete(user_prompt="weather?")

        assert response.content is None
        assert len(response.tool_calls) == 1
        assert response.tool_calls[0].id == "call-1"
        assert response.tool_calls[0].arguments == {"city": "Paris"}

    def test_call_rejects_tool_only_response_without_text(self):
        """Legacy call() still requires text content."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps(
            {
                "choices": [
                    {
                        "message": {
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call-1",
                                    "type": "function",
                                    "function": {
                                        "name": "lookup",
                                        "arguments": '{"city":"Paris"}',
                                    },
                                }
                            ],
                        }
                    }
                ]
            }
        )
        self.mock_conn_instance.getresponse.return_value = mock_response

        with pytest.raises(RuntimeError, match="empty text response"):
            self.llm.call(["weather?"])


class TestParseArguments:
    """Tests for LLamaCPP._parse_arguments."""

    def setup_method(self) -> None:
        with patch("lib.llm.llamacpp.urlparse") as mock_parse:
            mock_parsed = MagicMock()
            mock_parsed.netloc = "localhost:8989"
            mock_parsed.scheme = "http"
            mock_parse.return_value = mock_parsed
            self.llm = LLamaCPP("http://localhost:8989")

    def test_none_returns_empty_dict(self) -> None:
        assert self.llm._parse_arguments(None) == {}

    def test_valid_json_string_returns_dict(self) -> None:
        assert self.llm._parse_arguments('{"key": "value"}') == {"key": "value"}

    def test_json_array_raises(self) -> None:
        with pytest.raises(ValueError, match="JSON object"):
            self.llm._parse_arguments("[1, 2, 3]")

    def test_mapping_returns_as_is(self) -> None:
        assert self.llm._parse_arguments({"key": "value"}) == {"key": "value"}

    def test_invalid_type_raises(self) -> None:
        with pytest.raises(ValueError, match="JSON object string or mapping"):
            self.llm._parse_arguments(123)


class TestReasoningLogging:
    """Tests for reasoning logging in complete()."""

    def test_reasoning_logged_when_present(self, mock_logging) -> None:
        with (
            patch("lib.llm.llamacpp.urlparse") as mock_parse,
            patch("lib.llm.llamacpp.HTTPConnection") as mock_http,
        ):
            mock_parsed = MagicMock()
            mock_parsed.netloc = "localhost:8989"
            mock_parsed.scheme = "http"
            mock_parse.return_value = mock_parsed
            mock_conn = MagicMock()
            mock_http.return_value = mock_conn

            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = json.dumps(
                {
                    "choices": [
                        {
                            "message": {
                                "content": "answer",
                                "reasoning_content": "step-by-step reasoning",
                            }
                        }
                    ]
                }
            )
            mock_conn.getresponse.return_value = mock_response

            llm = LLamaCPP("http://localhost:8989")
            llm.call(["prompt"])

            mock_logging.info.assert_any_call("LLM reasoning: step-by-step reasoning")
