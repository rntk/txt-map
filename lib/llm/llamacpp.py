import json
import os
import logging
from typing import List, Union, Optional, Dict, Any
from urllib.parse import urlparse
from http.client import HTTPConnection, HTTPSConnection

from lib.llm.base import LLMClient


class LLamaCPP(LLMClient):
    def __init__(self, host: str, model: str = "moonshotai/Kimi-K2.5", max_context_tokens: int = 11000, token: Optional[str] = None, max_retries: int = 3, retry_delay: float = 1.0):
        super().__init__(max_context_tokens=max_context_tokens, max_retries=max_retries, retry_delay=retry_delay)
        u = urlparse(host)
        self.__host = u.netloc
        self.__is_https = u.scheme.lower() == "https"
        self.__model = model
        # Token can be passed in explicitly or read from the environment variable TOKEN
        self.__token = token or os.getenv("TOKEN")

    @property
    def provider_name(self) -> str:
        return "LlamaCPP"

    @property
    def provider_key(self) -> str:
        return "llamacpp"

    @property
    def model_name(self) -> str:
        return self.__model

    def _call_single(self, user_msgs: List[str], temperature: float) -> str:
        """Single attempt to call the LLM without retry logic."""
        conn = self.get_connection()
        try:
            prompt_preview = user_msgs[0][:500] + "..." if len(user_msgs[0]) > 500 else user_msgs[0]
            logging.info(f"LLM request (preview): {prompt_preview}")
            logging.info(f"LLM request full length: {len(user_msgs[0])} chars")

            body = json.dumps(
                {
                    "model": self.__model,
                    "messages": [{"role": "user", "content": user_msgs[0]}],
                    "temperature": temperature,
                    "cache_prompt": True
                }
            )
            headers = {'Content-type': 'application/json'}
            if self.__token:
                headers['Authorization'] = f"Bearer {self.__token}"
            conn.request("POST", "/v1/chat/completions", body, headers)
            res = conn.getresponse()
            resp_body = res.read()
            if res.status != 200:
                err_msg = f"{res.status} - {res.reason} - {resp_body}"
                logging.error(err_msg)
                raise RuntimeError(f"LLM API error: {res.status} {res.reason}")
            resp = json.loads(resp_body)

            content = resp.get("choices", [{}])[0].get("message", {}).get("content")
            logging.info(f"LLM raw response: {resp}")
            if content is None:
                logging.error("LLM response missing 'choices[0].message.content'")
                logging.error(f"Full response: {resp}")
                raise RuntimeError("LLM returned empty response")
            content_preview = content[:500] + "..." if len(content) > 500 else content
            logging.info(f"LLM response content (preview): {content_preview}")
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
                    "input": texts
                }
            )
            headers = {'Content-type': 'application/json'}
            if self.__token:
                headers['Authorization'] = f"Bearer {self.__token}"
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

    def rerank(self, query: str, documents: List[str], top_n: int = None) -> Optional[List[Dict[str, Any]]]:
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
            request_body = {
                "query": query,
                "documents": documents
            }

            if top_n is not None:
                request_body["top_n"] = top_n

            body = json.dumps(request_body)
            headers = {'Content-type': 'application/json'}
            if self.__token:
                headers['Authorization'] = f"Bearer {self.__token}"

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
