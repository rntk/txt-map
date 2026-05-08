"""Unit tests for crypto module."""

from unittest.mock import patch

import pytest

from lib.crypto import decrypt_token, encrypt_token, is_encryption_available


@patch.dict("os.environ", {"LLM_PROVIDERS_SECRET": "test-secret-key-123"})
def test_encrypt_decrypt_roundtrip() -> None:
    plaintext = "my-secret-token"
    encrypted = encrypt_token(plaintext)
    assert encrypted != plaintext
    decrypted = decrypt_token(encrypted)
    assert decrypted == plaintext


@patch.dict("os.environ", {"LLM_PROVIDERS_SECRET": "test-secret-key-123"})
def test_is_encryption_available_with_secret() -> None:
    assert is_encryption_available() is True


def test_is_encryption_available_without_secret() -> None:
    with patch.dict("os.environ", {}, clear=True):
        assert is_encryption_available() is False


def test_encrypt_token_without_secret_raises() -> None:
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(RuntimeError, match="LLM_PROVIDERS_SECRET"):
            encrypt_token("token")


def test_decrypt_token_without_secret_raises() -> None:
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(RuntimeError, match="LLM_PROVIDERS_SECRET"):
            decrypt_token("encrypted")
