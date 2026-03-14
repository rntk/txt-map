# LLM LlamaCPP Client

## Overview

`LLamaCPP` is an HTTP client class for a llama.cpp-compatible server exposing an OpenAI-compatible REST API. It supports chat completions, embeddings, and reranking.

The `lib/llm/__init__.py` is empty; all logic lives in `lib/llm/llamacpp.py`.

---

## Constructor

```python
LLamaCPP(host, max_context_tokens=11000, token=None, max_retries=3, retry_delay=1.0)
```

- `host`: Full URL (e.g. `http://localhost:8080`). Scheme and netloc are parsed to determine HTTP vs HTTPS and the target host.
- `max_context_tokens`: Soft cap on context size (not enforced internally, stored for callers).
- `token`: Bearer token for authorization. Falls back to the `TOKEN` environment variable if not provided.
- `max_retries`: Default number of retries for `call()`.
- `retry_delay`: Base delay in seconds for retry backoff.

---

## Methods

### `estimate_tokens(text) -> int`

Returns a rough token count estimate as `len(text) // 4`.

---

### `call(user_msgs, temperature=0.0, retries=None) -> str`

Calls the chat completions endpoint with retry logic.

- Uses only `user_msgs[0]` as the single user message.
- Model is hardcoded to `"openai/gpt-oss-20b"`, `cache_prompt` is always `True`.
- `retries` overrides `max_retries` if provided.
- On failure, retries up to `max_retries` times with **exponential backoff with jitter**: `delay = retry_delay * (2^attempt) + uniform(0, 0.5)`.
- Raises `RuntimeError` after all attempts are exhausted.
- Logs a warning on each failed attempt and an error on final failure.

Internal single-attempt logic (`_call_single`):
- POSTs to `/v1/chat/completions`.
- Extracts `choices[0].message.content` from the response.
- Raises `RuntimeError` on non-200 status, missing content, or JSON decode failure.
- All other exceptions are wrapped and re-raised as `RuntimeError`.
- Logs a 500-character preview of both the request and response content.
- Always closes the connection in a `finally` block.

---

### `embeddings(texts) -> Optional[List[List[float]]]`

POSTs to `/v1/embeddings`.

- Model: `"text-embedding-3-small"`, encoding format: `"float"`.
- Input: list of strings.
- Returns a list of float vectors extracted from `response["data"][i]["embedding"]`.
- Returns `None` on non-200 response or any exception (errors are logged, not raised).
- Always closes the connection.

---

### `rerank(query, documents, top_n=None) -> Optional[List[Dict[str, Any]]]`

POSTs to `/v1/rerank`.

- Request body contains `query` and `documents`; `top_n` is included only if provided.
- Returns `response["results"]` (a list of dicts with `document`, `index`, and `relevance_score`, sorted by descending relevance — as delivered by the server).
- Returns `None` on non-200 response or any exception (errors are logged, not raised).
- Always closes the connection.

---

### `get_connection() -> HTTPConnection | HTTPSConnection`

Returns a new `HTTPSConnection` if the host URL used HTTPS, otherwise `HTTPConnection`. Called fresh per request.

---

## Authorization

If a token is present (from constructor argument or `TOKEN` env var), all requests include an `Authorization: Bearer <token>` header.

---

## Error Handling Summary

| Method | On failure |
|---|---|
| `call` | Raises `RuntimeError` after retries |
| `embeddings` | Returns `None`, logs error |
| `rerank` | Returns `None`, logs error |
