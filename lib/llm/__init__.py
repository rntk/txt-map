import os
from lib.llm.base import LLMClient


def get_active_provider_name() -> str:
    """Check env vars to determine which provider would be used. No SDK imports."""
    if os.getenv("LLAMACPP_URL"):
        return "LlamaCPP"
    if os.getenv("OPENAI_API_KEY"):
        return "OpenAI"
    if os.getenv("ANTHROPIC_API_KEY"):
        return "Anthropic"
    return "None"


def create_llm_client() -> LLMClient:
    """Factory function that reads env vars and returns the appropriate LLM client."""
    llamacpp_url = os.getenv("LLAMACPP_URL")
    if llamacpp_url:
        from lib.llm.llamacpp import LLamaCPP
        token = os.getenv("TOKEN")
        return LLamaCPP(host=llamacpp_url, token=token, max_retries=5, retry_delay=2.0)

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        from lib.llm.openai_client import OpenAIClient
        model = os.getenv("OPENAI_MODEL", "gpt-4o")
        return OpenAIClient(api_key=openai_key, model=model)

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        from lib.llm.anthropic_client import AnthropicClient
        model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
        return AnthropicClient(api_key=anthropic_key, model=model)

    raise RuntimeError(
        "No LLM provider configured. Set one of: LLAMACPP_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY"
    )
