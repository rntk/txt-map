"""Unit tests for crypto module."""

import builtins
from typing import Any
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


_real_import = builtins.__import__


def _mock_import_no_cryptography(name: str, *args: Any, **kwargs: Any) -> Any:
    if name == "cryptography" or name.startswith("cryptography."):
        raise ImportError("No module named 'cryptography'")
    return _real_import(name, *args, **kwargs)


def test_get_fernet_raises_when_cryptography_missing() -> None:
    with patch.object(builtins, "__import__", side_effect=_mock_import_no_cryptography):
        with pytest.raises(RuntimeError, match="cryptography package is required"):
            from lib.crypto import _get_fernet

            _get_fernet()


def test_is_encryption_available_false_when_cryptography_missing() -> None:
    with patch.dict("os.environ", {"LLM_PROVIDERS_SECRET": "test-secret-key-123"}):
        with patch.object(
            builtins, "__import__", side_effect=_mock_import_no_cryptography
        ):
            from lib.crypto import is_encryption_available

            assert is_encryption_available() is False
