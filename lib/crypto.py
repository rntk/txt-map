import base64
import os
from typing import Any


_SALT = b"rsstag-llm-providers-v1"
_ITERATIONS = 100_000


def _get_fernet() -> Any:
    try:
        from cryptography.fernet import Fernet
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    except ImportError as exc:
        raise RuntimeError(
            "cryptography package is required for LLM providers"
        ) from exc

    secret = os.getenv("LLM_PROVIDERS_SECRET")
    if not secret:
        raise RuntimeError("LLM_PROVIDERS_SECRET environment variable is not set")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_SALT,
        iterations=_ITERATIONS,
    )
    key = base64.urlsafe_b64encode(kdf.derive(secret.encode()))
    return Fernet(key)


def is_encryption_available() -> bool:
    if not os.getenv("LLM_PROVIDERS_SECRET"):
        return False
    try:
        import cryptography  # noqa: F401
    except ImportError:
        return False
    return True


def encrypt_token(token: str) -> str:
    f = _get_fernet()
    return f.encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    f = _get_fernet()
    return f.decrypt(encrypted.encode()).decode()
