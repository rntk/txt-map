# LLM Architecture and Usage Guide

This document provides a comprehensive overview of how LLM (Large Language Model) functionality is implemented, configured, and used within the `rsstag` project. It serves as a reference for both human developers and AI agents for maintaining and extending LLM-related features.

## 1. Overview

The project uses LLMs for several core tasks:
- **Article Summarization**: Creating one-sentence summaries and bullet points for processed articles.
- **Topic-Aware Summaries**: Generating specific summaries for topics identified in the text.
- **Split Topic Generation**: Breaking down content into coherent semantic topics.
- **Subtopics & Mindmaps**: Generating hierarchical subtopics and mindmap structures.

## 2. LLM Client Hierarchy

The LLM logic is structured as a provider-based system to allow switching between different backend services (local or cloud).

### Base Interface
`lib/llm/base.py` defines the `LLMClient` abstract base class. All provider-specific clients must implement this interface:
- `call(user_msgs, temperature, retries)`: The main method to send prompts.
- `complete(...)`: Typed direct-client API for tool-aware requests and structured responses.
- `_complete_single(...)`: Abstract method for the actual provider request.
- `estimate_tokens(text)`: Used for chunking logic and token-limit management.

`call(...)` remains the compatibility API for existing text-only task code. It wraps
`complete(...)` and still returns plain text. Tool-call support is currently available
only through direct client `complete(...)` usage.

### Concrete Implementations
- **LlamaCPP** (`lib/llm/llamacpp.py`): Connects to a local server following the OpenAI API structure, typically used for local hosting.
- **OpenAIClient** (`lib/llm/openai_client.py`): Official OpenAI API integration.
- **AnthropicClient** (`lib/llm/anthropic_client.py`): Official Anthropic (Claude) API integration.

## 3. Dynamic Client Factory (`create_llm_client`)

The primary entry point for obtaining an LLM client is `lib/llm/create_llm_client(db=None)`.

### Why initialized with DB settings?
The factory takes a `db` argument to fetch **runtime configuration**. This enables:
1.  **Dynamic Switching**: Users can change the LLM provider (e.g., switch from LlamaCPP to OpenAI) via the UI/API without restarting the server or background workers.
2.  **Persistence**: Settings are stored in the `app_settings` collection in MongoDB (`AppSettingsStorage`), ensuring consistency across service restarts.
3.  **Fallback Logic**: If no DB settings are present, the factory falls back to environment variables (`LLAMACPP_URL`, `OPENAI_API_KEY`, etc.) or default provider definitions.

### Refresh Policy
Background workers (`workers.py`) call `create_llm_client(db=db)` at the start of **each task**. This ensures that if a user changes the LLM provider midway, the next queued task will automatically use the new configuration.

### Remote LLM Workers
Remote LLM workers do not read MongoDB provider records or encrypted DB tokens. When `LLM_WORKER_BACKEND=remote`, `llm_workers.py` requires `LLM_WORKER_PROVIDER_CONFIG` to point to a worker-local JSON file:

```json
{
  "providers": [
    {
      "id": "custom:<provider-id>",
      "name": "Remote Provider",
      "type": "openai|anthropic|openai_comp",
      "model": "model-name",
      "token": "provider-token",
      "url": "https://openai-compatible.example/v1"
    }
  ]
}
```

The `id` and `model` form the worker's supported model ID (`<id>:<model>`). Remote workers send those IDs when claiming tasks, so the API only assigns work the worker can execute. `url` is required for `openai_comp` providers and ignored for official OpenAI/Anthropic providers.

## 4. LLM Caching Mechanism

To optimize performance, reduce latency, and lower API costs, all LLM calls are wrapped in a caching layer.

### Key Components
- **MongoLLMCacheStore**: Manages persistent storage of LLM responses in MongoDB (`llm_cache` collection).
- **CachingLLMCallable**: A wrapper that checks the cache before making an actual LLM call.
- **Namespacing**: Cache entries are grouped by `namespace` (the task type) and `model_id`. This avoids collisions and allows sharing cache entries across different versions of the same model.

### Caching Rules
- The cache key is a SHA-256 hash of the `namespace + model_id + prompt_version + prompt + temperature`.
- Only calls with `temperature=0.0` are cached by default to ensure deterministic results.
- **Validated Caching**: Some tasks (like summarization) use `_ValidatedCachingLLMCallable` which only caches responses if they pass a validation check (e.g., being valid JSON).

## 5. Workflow and Usage Pattern

### In Background Workers
When a worker claims a task, it follows this pattern:
1.  Fetch latest LLM settings: `llm = create_llm_client(db=self.db)`.
2.  Initialize Cache: `cache_store = MongoLLMCacheStore(db)`.
3.  Execute Task Handler: Pass both `llm` and `cache_store` to the task function.
4.  Tasks use the `CachingLLMCallable` to perform the actual work.

### Tool Calls
- Direct synchronous client calls can now use `complete(...)` with provider-neutral
  `ToolDefinition`, `ToolCall`, `LLMMessage`, `LLMRequest`, and `LLMResponse` types.
- `OpenAIClient` uses the OpenAI Responses API for this typed path.
- `AnthropicClient` and `LLamaCPP` map the same neutral structures to their native
  message/tool formats.
- The async queue/worker/cache path remains text-only in this version and still stores
  plain string responses.

### In API Handlers
The API (`handlers/settings_handler.py`) allows querying and updating these settings:
- `GET /settings`: Returns currently active provider, model, and all available options.
- `PUT /settings/llm`: Updates the runtime configuration in the DB.

## 6. Prompt Engineering & Validation

Prompts are stored as templates within each task file (e.g., `lib/tasks/summarization.py`).
- **Security Rules**: Prompts include strict instructions to treat input as untrusted content to prevent prompt injection.
- **Formatting Rules**: Most tasks require structured output (JSON).
- **Retry Logic**: If an LLM returns invalid JSON or fails validation, tasks have built-in retry mechanisms with "correction prompts" to heal the output.

---
*Note: AI agents should always check `lib/llm/__init__.py` and `lib/storage/app_settings.py` when modifying how LLMs are instantiated.*
