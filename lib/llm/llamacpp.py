import json
import logging
import os
import re
from http.client import HTTPConnection, HTTPSConnection
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urlparse

from lib.llm.base import LLMClient

_THINK_TAG_RE = re.compile(
    r"<think\b[^>]*>(.*?)</think>",
    flags=re.DOTALL | re.IGNORECASE,
)


class LLamaCPP(LLMClient):
    def __init__(
        self,
        host: str,
        model: str = "moonshotai/Kimi-K2.5",
        max_context_tokens: int = 11000,
        token: Optional[str] = None,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        temperature: float = 0.8,
        min_p: float = 0.05,
        repeat_penalty: float = 1.1,
        repeat_last_n: int = 64,
        dry_multiplier: float = 0.8,
        dry_base: float = 1.75,
        dry_allowed_length: int = 2,
        stop: Optional[List[str]] = None,
    ) -> None:
        super().__init__(
            max_context_tokens=max_context_tokens,
            max_retries=max_retries,
            retry_delay=retry_delay,
        )
        u = urlparse(host)
        self.__host = u.netloc
        self.__is_https = u.scheme.lower() == "https"
        self.__model = model
        # Token can be passed in explicitly or read from the environment variable TOKEN
        self.__token = token or os.getenv("TOKEN")
        self.__temperature = temperature
        self.__min_p = min_p
        self.__repeat_penalty = repeat_penalty
        self.__repeat_last_n = repeat_last_n
        self.__dry_multiplier = dry_multiplier
        self.__dry_base = dry_base
        self.__dry_allowed_length = dry_allowed_length
        self.__stop = stop or ["User:", "\n\n"]

    @property
    def provider_name(self) -> str:
        return "LlamaCPP"

    @property
    def provider_key(self) -> str:
        return "llamacpp"

    @property
    def model_name(self) -> str:
        return self.__model

    def _extract_reasoning_and_content(
        self,
        response_payload: dict[str, Any],
    ) -> tuple[str | None, str | None]:
        choices = response_payload.get("choices")
        first_choice = choices[0] if isinstance(choices, list) and choices else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        if not isinstance(message, dict):
            message = {}

        raw_content = message.get("content")
        content = raw_content if isinstance(raw_content, str) else ""

        reasoning_parts: list[str] = []
        for key in ("reasoning", "reasoning_content", "thinking"):
            value = message.get(key)
            if isinstance(value, str):
                stripped = value.strip()
                if stripped:
                    reasoning_parts.append(stripped)

        for think_match in _THINK_TAG_RE.findall(content):
            stripped = think_match.strip()
            if stripped:
                reasoning_parts.append(stripped)

        reasoning = "\n\n".join(reasoning_parts).strip() or None
        cleaned_content = _THINK_TAG_RE.sub("", content).strip() or None
        return reasoning, cleaned_content

    def _call_single(self, user_msgs: List[str], temperature: float) -> str:
        """Single attempt to call the LLM without retry logic."""
        conn = self.get_connection()
        try:
            logging.info(f"LLM request: {user_msgs[0]}")

            body = json.dumps(
                {
                    "model": self.__model,
                    "messages": [{"role": "user", "content": user_msgs[0]}],
                    "temperature": temperature,
                    "cache_prompt": True,
                    "min_p": self.__min_p,
                    "repeat_penalty": self.__repeat_penalty,
                    "repeat_last_n": self.__repeat_last_n,
                    "dry_multiplier": self.__dry_multiplier,
                    "dry_base": self.__dry_base,
                    "dry_allowed_length": self.__dry_allowed_length,
                    #"stop": self.__stop,
                }
            )
            headers = {"Content-type": "application/json"}
            if self.__token:
                headers["Authorization"] = f"Bearer {self.__token}"
            conn.request("POST", "/v1/chat/completions", body, headers)
            res = conn.getresponse()
            resp_body = res.read()
            if res.status != 200:
                err_msg = f"{res.status} - {res.reason} - {resp_body}"
                logging.error(err_msg)
                raise RuntimeError(f"LLM API error: {res.status} {res.reason}")

            resp = json.loads(resp_body)

            reasoning, content = self._extract_reasoning_and_content(resp)
            if content is None:
                logging.error("LLM response missing 'choices[0].message.content'")
                logging.error(f"Full response: {resp}")
                raise RuntimeError("LLM returned empty response")
            if reasoning:
                logging.info(f"LLM reasoning: {reasoning}")
            logging.info(f"LLM response: {content}")
            return content
        except json.JSONDecodeError as e:
            err_msg = f"JSON decode error: {e}"
            logging.error(err_msg)
            raise RuntimeError(f"Invalid JSON response from LLM: {e}") from e
        except RuntimeError:
            raise
        except Exception as e:
            err_msg = f"LLM call exception: {type(e).__name__}: {e}"
            logging.error(err_msg)
            raise RuntimeError(f"LLM call failed: {e}") from e
        finally:
            conn.close()

    def get_connection(self) -> Union[HTTPConnection, HTTPSConnection]:
        if self.__is_https:
            return HTTPSConnection(self.__host)
        else:
            return HTTPConnection(self.__host)

    def embeddings(self, texts: List[str]) -> Optional[List[List[float]]]:
        conn = self.get_connection()
        try:
            body = json.dumps(
                {
                    "model": "text-embedding-3-small",
                    "encoding_format": "float",
                    "input": texts,
                }
            )
            headers = {"Content-type": "application/json"}
            if self.__token:
                headers["Authorization"] = f"Bearer {self.__token}"
            conn.request("POST", "/v1/embeddings", body, headers)
            res = conn.getresponse()
            resp_body = res.read()
            if res.status != 200:
                err_msg = f"{res.status} - {res.reason} - {resp_body}"
                logging.error(err_msg)
                return None
            resp = json.loads(resp_body)
            embeds = []
            for emb in resp["data"]:
                embeds.append(emb["embedding"])

            return embeds
        except Exception as e:
            err_msg = f"Embeddings exception: {type(e).__name__}: {e}"
            logging.error(err_msg)
            return None
        finally:
            conn.close()

    def rerank(
        self, query: str, documents: List[str], top_n: Optional[int] = None
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Reranks documents according to their relevance to the query.

        Args:
            query: The query string to rank documents against
            documents: List of document strings to rank
            top_n: Optional number of top documents to return (default returns all documents)

        Returns:
            List of dictionaries containing:
                - document: The original document text
                - index: Original index of the document in the input list
                - relevance_score: A float indicating relevance (higher is more relevant)
            Sorted by relevance_score in descending order, or None if the API call fails.
        """
        conn = self.get_connection()
        try:
            request_body = {"query": query, "documents": documents}

            if top_n is not None:
                request_body["top_n"] = top_n

            body = json.dumps(request_body)
            headers = {"Content-type": "application/json"}
            if self.__token:
                headers["Authorization"] = f"Bearer {self.__token}"

            conn.request("POST", "/v1/rerank", body, headers)
            res = conn.getresponse()
            resp_body = res.read()

            if res.status != 200:
                err_msg = f"{res.status} - {res.reason} - {resp_body}"
                logging.error(err_msg)

                return None

            resp = json.loads(resp_body)

            return resp.get("results", [])
        except Exception as e:
            err_msg = f"Rerank exception: {type(e).__name__}: {e}"
            logging.error(err_msg)
            return None
        finally:
            conn.close()
