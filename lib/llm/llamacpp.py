import json
import os
from typing import List, Union, Optional, Dict, Any
import logging
from urllib.parse import urlparse
from http.client import HTTPConnection, HTTPSConnection

class LLamaCPP:
    def __init__(self, host: str, max_context_tokens: int = 11000, token: Optional[str] = None):
        u = urlparse(host)
        self.__host = u.netloc
        self.__is_https = u.scheme.lower() == "https"
        self.__max_context_tokens = max_context_tokens  # Leave some buffer from the actual context size
        # Token can be passed in explicitly or read from the environment variable TOKEN
        self.__token = token or os.getenv("TOKEN")

    def estimate_tokens(self, text: str) -> int:
        """Rough estimation: ~4 characters per token on average"""
        return len(text) // 4

    def call(self, user_msgs: List[str], temperature: float=0.0) -> str:
        conn = self.get_connection()
        body = json.dumps(
            {
                "model": "gpt-oss-120b",
                "messages": [{"role": "user", "content": user_msgs[0]}],
                #"temperature": temperature,
                #"cache_prompt": True
            }
        )
        headers = {'Content-type': 'application/json'}
        if self.__token:
            headers['Authorization'] = f"Bearer {self.__token}"
        #conn.request("POST", "/openai/v1/chat/completions", body, headers)
        conn.request("POST", "/v1/chat/completions", body, headers)
        res = conn.getresponse()
        resp_body = res.read()
        #logging.info("server response: %s", resp_body)
        if res.status != 200:
            err_msg = f"{res.status} - {res.reason} - {resp_body}"
            logging.error(err_msg)
            return err_msg
        resp = json.loads(resp_body)

        return resp["choices"][0]["message"]["content"]

    def get_connection(self) -> Union[HTTPConnection, HTTPSConnection]:
        if self.__is_https:
            return HTTPSConnection(self.__host)
        else:
            return HTTPConnection(self.__host)

    def embeddings(self, texts: List[str]) -> Optional[List[List[float]]]:
        conn = self.get_connection()
        body = json.dumps(
            {
                #"model":"GPT-4",
                "model":"text-embedding-3-small",
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
        #logging.info("server response: %s", resp_body)
        if res.status != 200:
            err_msg = f"{res.status} - {res.reason} - {resp_body}"
            logging.error(err_msg)
            return None
        resp = json.loads(resp_body)
        embeds = []
        for emb in resp["data"]:
            embeds.append(emb["embedding"])

        return embeds

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
