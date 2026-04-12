import unittest
from unittest.mock import MagicMock, patch
from lib.tasks.markup_generation import (
    _generate_html_for_range,
    TopicRange,
)


class TestMarkupGenerationRetryLogic(unittest.TestCase):
    def test_generate_html_for_range_retry_includes_context(self):
        # Setup mocks
        mock_llm = MagicMock()
        # First call returns garbage to trigger retry
        # Second call returns valid tag
        mock_llm.call.side_effect = ["garbage", "1-5: p"]

        topic_range = TopicRange(
            range_index=1, sentence_start=1, sentence_end=1, text="Hello world."
        )

        # We need to mock _call_llm_cached because it might hit cache
        with patch("lib.tasks.markup_generation._call_llm_cached") as mock_cached:
            mock_cached.return_value = "garbage"

            _generate_html_for_range(
                topic_name="test",
                topic_range=topic_range,
                llm=mock_llm,
                cache_store=None,
                namespace="test",
                max_retries=2,
            )

            # Verify the second call to mock_llm.call (which is the retry)
            # The first call was handled by _call_llm_cached, not mock_llm.call directly
            self.assertEqual(mock_llm.call.call_count, 1)
            args, kwargs = mock_llm.call.call_args
            full_correction_prompt = args[0][0]

            # Verify it contains the original prompt (well, parts of it)
            self.assertIn("<clean_content>", full_correction_prompt)
            self.assertIn("Hello world.", full_correction_prompt)
            # Verify it contains the previous attempt
            self.assertIn("<previous_attempt>", full_correction_prompt)
            self.assertIn("garbage", full_correction_prompt)
            # Verify it contains the correction request
            self.assertIn("<correction_request>", full_correction_prompt)
            self.assertIn(
                "Your previous response could not be parsed", full_correction_prompt
            )

    def test_generate_html_for_range_from_response_retry_includes_context(self):
        from lib.tasks.markup_generation import _generate_html_for_range_from_response

        # Setup mocks
        mock_llm = MagicMock()
        # Initial response is garbage, retry returns valid tag
        mock_llm.call.return_value = "1-5: p"

        topic_range = TopicRange(
            range_index=1, sentence_start=1, sentence_end=1, text="Hello world."
        )

        _generate_html_for_range_from_response(
            topic_name="test",
            topic_range=topic_range,
            llm=mock_llm,
            max_retries=2,
            initial_response="initial_garbage",
        )

        # Verify the call to mock_llm.call
        self.assertEqual(mock_llm.call.call_count, 1)
        args, kwargs = mock_llm.call.call_args
        full_correction_prompt = args[0][0]

        # Verify context is present
        self.assertIn("<clean_content>", full_correction_prompt)
        self.assertIn("Hello world.", full_correction_prompt)
        self.assertIn("<previous_attempt>", full_correction_prompt)
        self.assertIn("initial_garbage", full_correction_prompt)
        self.assertIn("<correction_request>", full_correction_prompt)


if __name__ == "__main__":
    unittest.main()
