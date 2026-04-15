from unittest.mock import MagicMock, patch

from lib.llm import create_llm_client


def test_create_llm_client_uses_active_provider_key() -> None:
    db = MagicMock()
    expected_client = MagicMock()

    with (
        patch(
            "lib.llm.get_active_llm_settings",
            return_value={
                "provider_key": "custom:abc123",
                "provider": "Remote Llama",
                "model": "llama-3.3",
                "available_providers": [],
            },
        ),
        patch(
            "lib.llm.create_llm_client_from_config",
            return_value=expected_client,
        ) as mock_create_from_config,
    ):
        client = create_llm_client(db=db)

    assert client == expected_client
    mock_create_from_config.assert_called_once_with(
        "custom:abc123",
        "llama-3.3",
        db=db,
    )
