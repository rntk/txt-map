import logging

from lib.tasks.markup_generation import (
    _build_html_from_labels,
    _build_markup_generation_prompt,
    _build_numbered_lines,
    _build_plain_html,
    _cleanup_text_for_llm,
    _extract_topic_ranges,
    _is_grounded,
    _markdown_to_html,
    _normalize_grounding_text,
    _parse_label_output,
    process_markup_generation,
)


def test_build_markup_generation_prompt_includes_numbered_lines() -> None:
    prompt = _build_markup_generation_prompt("1: Hello world.\n2: Second line.")

    assert "1: Hello world." in prompt
    assert "2: Second line." in prompt
    assert "block_type" in prompt
    assert "No other text" in prompt


def test_build_numbered_lines_numbers_non_empty_lines() -> None:
    lines, numbered = _build_numbered_lines("Title\nBody.\n\nNext para.")

    assert lines == ["Title", "Body.", "Next para."]
    assert numbered == "1: Title\n2: Body.\n\n3: Next para."


def test_build_numbered_lines_empty_text() -> None:
    lines, numbered = _build_numbered_lines("")

    assert lines == []
    assert numbered == ""


def test_parse_label_output_parses_valid_labels() -> None:
    labels, count = _parse_label_output("1: h1\n2: p\n3: li\n4: li", 4)

    assert labels == {1: "h1", 2: "p", 3: "li", 4: "li"}
    assert count == 4


def test_parse_label_output_defaults_missing_lines_to_p() -> None:
    labels, count = _parse_label_output("1: h1", 3)

    assert labels[2] == "p"
    assert labels[3] == "p"
    assert count == 1


def test_parse_label_output_unknown_label_falls_back_to_p() -> None:
    labels, count = _parse_label_output("1: marquee", 1)

    assert labels[1] == "p"
    assert count == 1


def test_parse_label_output_returns_zero_count_on_unparseable_output() -> None:
    _, count = _parse_label_output("nothing useful here", 2)

    assert count == 0


def test_build_html_from_labels_heading_and_paragraph() -> None:
    lines = ["Project Status", "We completed the migration."]
    labels = {1: "h1", 2: "p"}

    html = _build_html_from_labels(lines, labels)

    assert html == "<h1>Project Status</h1>\n<p>We completed the migration.</p>"


def test_build_html_from_labels_groups_consecutive_list_items() -> None:
    lines = ["Step one.", "Step two.", "Step three."]
    labels = {1: "oli", 2: "oli", 3: "oli"}

    html = _build_html_from_labels(lines, labels)

    assert html == "<ol><li>Step one.</li><li>Step two.</li><li>Step three.</li></ol>"


def test_build_html_from_labels_unordered_list() -> None:
    lines = ["Apple", "Banana"]
    labels = {1: "li", 2: "li"}

    html = _build_html_from_labels(lines, labels)

    assert html == "<ul><li>Apple</li><li>Banana</li></ul>"


def test_build_html_from_labels_code_block() -> None:
    lines = ["x = 1", "y = 2"]
    labels = {1: "code", 2: "code"}

    html = _build_html_from_labels(lines, labels)

    assert html == "<pre><code>x = 1\ny = 2</code></pre>"


def test_build_html_from_labels_blockquote() -> None:
    lines = ["To be or not to be."]
    labels = {1: "bq"}

    html = _build_html_from_labels(lines, labels)

    assert html == "<blockquote><p>To be or not to be.</p></blockquote>"


def test_build_html_from_labels_escapes_html_in_content() -> None:
    lines = ["<script>alert(1)</script>"]
    labels = {1: "p"}

    html = _build_html_from_labels(lines, labels)

    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_markdown_to_html_escapes_raw_html() -> None:
    html = _markdown_to_html("Hello <script>alert(1)</script> world")

    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_is_grounded_accepts_whitespace_only_differences() -> None:
    source = "Alpha beta.\nGamma delta."
    generated_html = "<p>Alpha beta. Gamma delta.</p>"

    assert _is_grounded(source, generated_html) is True


def test_is_grounded_rejects_punctuation_changes() -> None:
    source = "Alpha beta."
    generated_html = "<p>Alpha beta!</p>"

    assert _is_grounded(source, generated_html) is False


def test_is_grounded_rejects_reordered_text() -> None:
    source = "Alpha beta gamma"
    generated_html = "<p>beta Alpha gamma</p>"

    assert _is_grounded(source, generated_html) is False


def test_build_plain_html_preserves_paragraphs() -> None:
    html = _build_plain_html("First line.\nSecond line.\n\nThird line.")

    assert html == "<p>First line. Second line.</p><p>Third line.</p>"


def test_extract_topic_ranges_prefers_topic_ranges() -> None:
    topic = {
        "name": "Topic",
        "sentences": [1, 2, 3, 4],
        "ranges": [
            {"sentence_start": 2, "sentence_end": 3},
            {"sentence_start": 4, "sentence_end": 4},
        ],
    }

    ranges = _extract_topic_ranges(
        topic,
        ["S1", "S2", "S3", "S4"],
    )

    assert [item.sentence_start for item in ranges] == [2, 4]
    assert [item.sentence_end for item in ranges] == [3, 4]
    assert [item.text for item in ranges] == ["S2\nS3", "S4"]


def test_extract_topic_ranges_groups_consecutive_sentences() -> None:
    topic = {"name": "Topic", "sentences": [1, 2, 4, 6, 7]}

    ranges = _extract_topic_ranges(
        topic,
        ["S1", "S2", "S3", "S4", "S5", "S6", "S7"],
    )

    assert [(item.sentence_start, item.sentence_end) for item in ranges] == [
        (1, 2),
        (4, 4),
        (6, 7),
    ]


def test_normalize_grounding_text_collapses_whitespace_only() -> None:
    assert _normalize_grounding_text(" Alpha \n beta\tgamma ") == ("Alpha beta gamma")


def test_process_markup_generation_stores_html_ranges(monkeypatch) -> None:
    captured_results: dict[str, object] = {}

    def fake_update_results(
        self, submission_id: str, results: dict[str, object]
    ) -> bool:
        assert submission_id == "sub-123"
        captured_results.update(results)
        return True

    monkeypatch.setattr(
        "lib.tasks.markup_generation.SubmissionsStorage.update_results",
        fake_update_results,
    )

    class MockLLM:
        model_id = "test-model"

        def call(self, messages, temperature=0.0):
            del temperature
            prompt = messages[0]
            assert "block_type" in prompt
            # Return label annotations (no text copying)
            return "1: p\n2: p"

    submission = {
        "submission_id": "sub-123",
        "results": {
            "sentences": ["Alpha beta.", "Gamma delta."],
            "topics": [{"name": "topic-a", "sentences": [1, 2]}],
        },
    }

    process_markup_generation(submission, db=object(), llm=MockLLM())

    markup = captured_results["markup"]
    assert markup["topic-a"]["ranges"][0]["sentence_start"] == 1
    assert markup["topic-a"]["ranges"][0]["sentence_end"] == 2
    assert (
        markup["topic-a"]["ranges"][0]["html"]
        == "<p>Alpha beta.</p>\n<p>Gamma delta.</p>"
    )


def test_process_markup_generation_retries_with_correction_and_falls_back(
    monkeypatch, caplog
) -> None:
    captured_results: dict[str, object] = {}

    def fake_update_results(
        self, submission_id: str, results: dict[str, object]
    ) -> bool:
        assert submission_id == "sub-123"
        captured_results.update(results)
        return True

    monkeypatch.setattr(
        "lib.tasks.markup_generation.SubmissionsStorage.update_results",
        fake_update_results,
    )

    class MockLLM:
        model_id = "test-model"

        def __init__(self) -> None:
            self.prompts: list[str] = []

        def call(self, messages, temperature=0.0):
            del temperature
            self.prompts.append(messages[0])
            # Always return unparseable output → triggers retry → fallback
            return "no valid labels here"

    submission = {
        "submission_id": "sub-123",
        "results": {
            "sentences": ["Exact source text.", "Second sentence."],
            "topics": [{"name": "topic-a", "sentences": [1, 2]}],
        },
    }

    llm = MockLLM()
    with caplog.at_level(logging.WARNING):
        process_markup_generation(submission, db=object(), llm=llm, max_retries=2)

    markup = captured_results["markup"]
    assert (
        markup["topic-a"]["ranges"][0]["html"]
        == "<p>Exact source text. Second sentence.</p>"
    )
    assert any("BLOCK TYPES" in prompt for prompt in llm.prompts[1:])
    assert "Markup falling back to plain HTML for topic 'topic-a' range 1" in (
        caplog.text
    )


def test_cleanup_text_for_llm_strips_html_entities() -> None:
    assert _cleanup_text_for_llm("hello&nbsp;&amp;&lt;world") == "hello &<world"


def test_cleanup_text_for_llm_replaces_nbsp() -> None:
    assert _cleanup_text_for_llm("hello\xa0world") == "hello world"


def test_cleanup_text_for_llm_strips_zero_width_chars() -> None:
    text = "hello\u200b\u200c\u200d\u200fworld"
    assert _cleanup_text_for_llm(text) == "helloworld"


def test_cleanup_text_for_llm_strips_bom_and_soft_hyphen() -> None:
    text = "\ufeffhello\u00adworld"
    assert _cleanup_text_for_llm(text) == "helloworld"


def test_cleanup_text_for_llm_removes_whitespace_only_lines() -> None:
    text = "hello\n   \nworld"
    assert _cleanup_text_for_llm(text) == "hello\n\nworld"


def test_cleanup_text_for_llm_removes_zero_width_spacer_lines() -> None:
    spacer = " \u200c \u200c \u200c "
    text = f"hello\n{spacer}\nworld"
    assert _cleanup_text_for_llm(text) == "hello\n\nworld"


def test_cleanup_text_for_llm_collapses_excessive_newlines() -> None:
    text = "hello\n\n\n\nworld"
    assert _cleanup_text_for_llm(text) == "hello\n\nworld"


def test_cleanup_text_for_llm_strips_trailing_whitespace_per_line() -> None:
    text = "hello  \n  world  "
    assert _cleanup_text_for_llm(text) == "hello\nworld"


def test_cleanup_text_for_llm_preserves_single_newlines() -> None:
    text = "line one\nline two\nline three"
    assert _cleanup_text_for_llm(text) == "line one\nline two\nline three"


def test_cleanup_text_for_llm_cleans_email_artifact_noise() -> None:
    text = (
        "Brewvery Unsubscribe Feb 8, 2026\n"
        " \u200c \u200c \u200c \u200c \u200c \n"
        "\n"
        "  \n"
        "Midjourney illustration."
    )
    result = _cleanup_text_for_llm(text)
    assert "\u200c" not in result
    assert "Brewvery Unsubscribe Feb 8, 2026" in result
    assert "Midjourney illustration." in result
    assert result == "Brewvery Unsubscribe Feb 8, 2026\n\nMidjourney illustration."
