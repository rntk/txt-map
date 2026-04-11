"""Generate grounded HTML markup for topic ranges using structural annotation."""

from __future__ import annotations

import html as html_module
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from txt_splitt.cache import CacheEntry, _build_cache_key

from lib.llm_queue.client import QueuedLLMClient
from lib.storage.submissions import SubmissionsStorage


logger = logging.getLogger(__name__)

_PROMPT_VERSION = "markup_annotation_v1"

MARKUP_GENERATION_PROMPT_TEMPLATE = """You are a text formatting assistant.

Classify each numbered line of text into a block type.

### BLOCK TYPES
h1   short standalone title (top-level heading)
h2   second-level heading
h3   third-level heading
p    paragraph text (use this when unsure)
li   unordered list item (bullet point)
oli  ordered list item (numbered step)
bq   blockquote / quoted speech
code code snippet or technical literal
hr   horizontal rule / section separator (e.g. "---", "***", "===")

### OUTPUT FORMAT
Return exactly one classification per input line:
  {{line_number}}: {{block_type}}

No other text. No explanation.

### EXAMPLE

Input:
  1: Project Status
  2: We completed the migration.
  3: First step is preparation.
  4: Second step is execution.

Output:
  1: h1
  2: p
  3: oli
  4: oli

### TEXT TO CLASSIFY

{numbered_lines}
"""

MARKUP_CORRECTION_PROMPT_TEMPLATE = """Your previous output could not be parsed. Try again.

### OUTPUT FORMAT
Return exactly one classification per input line:
  {{line_number}}: {{block_type}}

No other text. No explanation.

### BLOCK TYPES
h1  h2  h3  p  li  oli  bq  code  hr

### TEXT TO CLASSIFY

{numbered_lines}
"""

_MARKDOWN_FENCE_RE = re.compile(r"^\s*```[a-zA-Z0-9_-]*\s*(.*?)\s*```\s*$", re.DOTALL)
_RAW_HTML_TAG_RE = re.compile(r"</?[A-Za-z][^>]*>")
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
_LABEL_LINE_RE = re.compile(r"^(\d+)\s*:\s*(\w+)$")
_CLAUSE_BOUNDARY_RE = re.compile(
    r"(?:(?<=[.!?;:\u3002\uff01\uff1f\uff1b\uff1a])\s+|(?<=,)\s+|(?<=\uff0c)\s*)"
)
_INVISIBLE_CHARS_RE = re.compile(
    "["
    "\u0000-\u0008\u000b\u000c\u000e-\u001f"
    "\u007f-\u009f"
    "\u00ad"
    "\u200b-\u200f"
    "\u2028-\u202f"
    "\u2060-\u206f"
    "\ufeff"
    "\ufff9-\ufffb"
    "]"
)

_VALID_LABELS = frozenset({"h1", "h2", "h3", "p", "li", "oli", "bq", "code", "hr"})


@dataclass(frozen=True)
class TopicRange:
    range_index: int
    sentence_start: int
    sentence_end: int
    text: str


def _cache_namespace(llm_client: Any) -> str:
    model_id = getattr(llm_client, "model_id", "unknown")
    return f"markup_generation_markdown:{model_id}"


def _call_llm_cached(
    prompt: str,
    llm: Any,
    cache_store: Any,
    namespace: str,
    temperature: float = 0.0,
    skip_cache_read: bool = False,
) -> str:
    model_id = getattr(llm, "model_id", "unknown")

    if cache_store is None:
        return llm.call([prompt], temperature=temperature)

    cache_key = _build_cache_key(
        namespace=namespace,
        model_id=model_id,
        prompt_version=_PROMPT_VERSION,
        prompt=prompt,
        temperature=temperature,
    )
    if not skip_cache_read:
        entry = cache_store.get(cache_key)
        if entry is not None:
            return entry.response

    response = llm.call([prompt], temperature=temperature)
    cache_store.set(
        CacheEntry(
            key=cache_key,
            response=response,
            created_at=time.time(),
            namespace=namespace,
            model_id=model_id,
            prompt_version=_PROMPT_VERSION,
            temperature=temperature,
        )
    )
    return response


def _supports_parallel_submission(llm: Any) -> bool:
    return isinstance(llm, QueuedLLMClient)


def _cleanup_text_for_llm(text: str) -> str:
    cleaned = html_module.unescape(text or "")
    cleaned = cleaned.replace("\xa0", " ")
    cleaned = _INVISIBLE_CHARS_RE.sub("", cleaned)
    lines = cleaned.splitlines()
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in lines]
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _build_numbered_lines(cleaned_text: str) -> Tuple[List[str], str]:
    """Return (content_lines, numbered_text).

    content_lines: non-empty source lines in order (one label expected per line).
    numbered_text: formatted for the LLM, with blank lines preserved as separators.
    """
    raw_lines = cleaned_text.splitlines()
    content_lines: List[str] = []
    numbered_parts: List[str] = []
    counter = 1
    for line in raw_lines:
        if line.strip():
            granular_lines = _split_line_for_markup(line)
            for granular_line in granular_lines:
                content_lines.append(granular_line)
                numbered_parts.append(f"{counter}: {granular_line}")
                counter += 1
        else:
            numbered_parts.append("")
    return content_lines, "\n".join(numbered_parts)


def _split_line_for_markup(line: str) -> List[str]:
    stripped_line = line.strip()
    if not stripped_line:
        return []

    word_count = len(stripped_line.split())
    if word_count <= 20:
        return [stripped_line]

    split_lines = [
        part.strip()
        for part in _CLAUSE_BOUNDARY_RE.split(stripped_line)
        if part.strip()
    ]
    if len(split_lines) <= 1:
        return [stripped_line]

    merged_lines: List[str] = []
    current_parts: List[str] = []

    for part in split_lines:
        current_parts.append(part)
        current_line = " ".join(current_parts).strip()
        current_word_count = len(current_line.split())

        if current_word_count < 8:
            continue

        if current_word_count >= 18 or part.endswith((".", "!", "?", ",", ";", ":", "\u3002", "\uff01", "\uff1f", "\uff1b", "\uff1a", "\uff0c")):
            merged_lines.append(current_line)
            current_parts = []

    if current_parts:
        remainder = " ".join(current_parts).strip()
        if merged_lines and len(remainder.split()) < 6:
            merged_lines[-1] = f"{merged_lines[-1]} {remainder}".strip()
        else:
            merged_lines.append(remainder)

    return merged_lines or [stripped_line]


def _parse_label_output(output: str, line_count: int) -> Tuple[Dict[int, str], int]:
    """Parse LLM label output into a line-number → label mapping.

    Returns (labels, parsed_count).  Missing or invalid labels default to 'p'.
    parsed_count is the number of lines the LLM actually answered.
    """
    labels: Dict[int, str] = {}
    parsed = 0
    for raw_line in _strip_markdown_fences(output).splitlines():
        m = _LABEL_LINE_RE.match(raw_line.strip())
        if not m:
            continue
        num = int(m.group(1))
        label = m.group(2).lower()
        if 1 <= num <= line_count:
            labels[num] = label if label in _VALID_LABELS else "p"
            parsed += 1
    for i in range(1, line_count + 1):
        labels.setdefault(i, "p")
    return labels, parsed


def _build_html_from_labels(lines: List[str], labels: Dict[int, str]) -> str:
    """Render source lines to HTML using the per-line block-type labels."""
    parts: List[str] = []
    i = 0
    n = len(lines)

    while i < n:
        line_num = i + 1
        label = labels.get(line_num, "p")
        text = html_module.escape(lines[i], quote=False)

        if label in ("li", "oli"):
            list_tag = "ul" if label == "li" else "ol"
            items = [f"<li>{text}</li>"]
            i += 1
            while i < n and labels.get(i + 1, "p") == label:
                items.append(f"<li>{html_module.escape(lines[i], quote=False)}</li>")
                i += 1
            parts.append(f"<{list_tag}>{''.join(items)}</{list_tag}>")

        elif label == "code":
            code_lines = [text]
            i += 1
            while i < n and labels.get(i + 1, "p") == "code":
                code_lines.append(html_module.escape(lines[i], quote=False))
                i += 1
            parts.append(f"<pre><code>{chr(10).join(code_lines)}</code></pre>")

        elif label == "bq":
            parts.append(f"<blockquote><p>{text}</p></blockquote>")
            i += 1

        elif label in ("h1", "h2", "h3"):
            parts.append(f"<{label}>{text}</{label}>")
            i += 1

        elif label == "hr":
            parts.append("<hr>")
            i += 1

        else:  # p or unrecognised
            parts.append(f"<p>{text}</p>")
            i += 1

    return "\n".join(parts)


def _build_markup_generation_prompt(numbered_lines: str) -> str:
    return MARKUP_GENERATION_PROMPT_TEMPLATE.format(numbered_lines=numbered_lines)


def _strip_markdown_fences(text: str) -> str:
    cleaned = (text or "").strip()
    match = _MARKDOWN_FENCE_RE.match(cleaned)
    if match:
        return match.group(1).strip()
    return cleaned


def _escape_raw_html(markdown_text: str) -> str:
    return _RAW_HTML_TAG_RE.sub(
        lambda match: html_module.escape(match.group(0)),
        markdown_text,
    )


def _markdown_to_html(markdown_text: str) -> str:
    import markdown as markdown_lib

    safe_markdown = _escape_raw_html(markdown_text)
    return markdown_lib.markdown(safe_markdown, extensions=["extra"])


def _html_to_text(html: str) -> str:
    stripped = _TAG_RE.sub(" ", html or "")
    return html_module.unescape(stripped)


def _normalize_grounding_text(text: str) -> str:
    normalized = html_module.unescape(text or "").replace("\xa0", " ")
    normalized = _WHITESPACE_RE.sub(" ", normalized).strip()
    return normalized


def _is_grounded(source_text: str, generated_html: str) -> bool:
    return _normalize_grounding_text(source_text) == _normalize_grounding_text(
        _html_to_text(generated_html)
    )


def _build_plain_html(source_text: str) -> str:
    lines = [line.strip() for line in (source_text or "").splitlines()]
    blocks: List[str] = []
    current: List[str] = []

    for line in lines:
        if line:
            current.append(line)
            continue
        if current:
            blocks.append(" ".join(current))
            current = []

    if current:
        blocks.append(" ".join(current))

    if not blocks and source_text.strip():
        blocks = [source_text.strip()]

    if not blocks:
        return ""

    return "".join(
        f"<p>{html_module.escape(block, quote=False)}</p>" for block in blocks
    )


def _group_consecutive(indices: Iterable[int]) -> List[List[int]]:
    ordered = sorted({index for index in indices if isinstance(index, int)})
    if not ordered:
        return []

    groups: List[List[int]] = [[ordered[0]]]
    for index in ordered[1:]:
        if index == groups[-1][-1] + 1:
            groups[-1].append(index)
        else:
            groups.append([index])
    return groups


def _extract_topic_ranges(
    topic: Dict[str, Any],
    all_sentences: List[str],
) -> List[TopicRange]:
    raw_ranges = topic.get("ranges")
    ranges: List[TopicRange] = []

    if isinstance(raw_ranges, list) and raw_ranges:
        for index, raw_range in enumerate(raw_ranges, start=1):
            sentence_start = raw_range.get("sentence_start")
            sentence_end = raw_range.get("sentence_end", sentence_start)
            if not isinstance(sentence_start, int) or not isinstance(sentence_end, int):
                continue
            if sentence_start < 1 or sentence_end < sentence_start:
                continue
            text = "\n".join(all_sentences[sentence_start - 1 : sentence_end]).strip()
            ranges.append(
                TopicRange(
                    range_index=index,
                    sentence_start=sentence_start,
                    sentence_end=sentence_end,
                    text=text,
                )
            )
        if ranges:
            return ranges

    sentence_groups = _group_consecutive(topic.get("sentences", []))
    for index, group in enumerate(sentence_groups, start=1):
        sentence_start = group[0]
        sentence_end = group[-1]
        text = "\n".join(all_sentences[sentence_start - 1 : sentence_end]).strip()
        ranges.append(
            TopicRange(
                range_index=index,
                sentence_start=sentence_start,
                sentence_end=sentence_end,
                text=text,
            )
        )
    return ranges


def _generate_grounded_html_for_range(
    topic_name: str,
    topic_range: TopicRange,
    llm: Any,
    cache_store: Any,
    namespace: str,
    max_retries: int,
) -> str:
    cleaned_text = _cleanup_text_for_llm(topic_range.text)
    content_lines, numbered_text = _build_numbered_lines(cleaned_text)

    if not content_lines:
        return _build_plain_html(cleaned_text)

    if len(content_lines) == 1:
        return f"<p>{html_module.escape(content_lines[0], quote=False)}</p>"

    prompt = _build_markup_generation_prompt(numbered_text)
    skip_cache = False

    for attempt in range(max_retries):
        try:
            if attempt == 0:
                response = _call_llm_cached(
                    prompt=prompt,
                    llm=llm,
                    cache_store=cache_store,
                    namespace=namespace,
                    temperature=0.0,
                    skip_cache_read=skip_cache,
                )
            else:
                correction_prompt = MARKUP_CORRECTION_PROMPT_TEMPLATE.format(
                    numbered_lines=numbered_text,
                )
                response = llm.call([correction_prompt], temperature=0.0)

            labels, parsed_count = _parse_label_output(response, len(content_lines))
            if parsed_count > 0:
                candidate = _build_html_from_labels(content_lines, labels)
                if _is_grounded(cleaned_text, candidate):
                    return candidate
                logger.warning(
                    "Markup HTML not grounded for topic '%s' range %d (%d/%d), retrying",
                    topic_name,
                    topic_range.range_index,
                    attempt + 1,
                    max_retries,
                )
            else:
                logger.warning(
                    "Markup label parsing yielded no results for topic '%s' range %d (%d/%d)",
                    topic_name,
                    topic_range.range_index,
                    attempt + 1,
                    max_retries,
                )
        except Exception as exc:
            logger.warning(
                "Markup generation failed for topic '%s' range %d (%d/%d): %s",
                topic_name,
                topic_range.range_index,
                attempt + 1,
                max_retries,
                exc,
            )

        skip_cache = True
        if attempt < max_retries - 1:
            time.sleep(float(attempt + 1))

    logger.warning(
        "Markup falling back to plain HTML for topic '%s' range %d",
        topic_name,
        topic_range.range_index,
    )
    return _build_plain_html(cleaned_text)


def _render_markup_candidate(
    *,
    topic_name: str,
    topic_range: TopicRange,
    cleaned_text: str,
    content_lines: List[str],
    response: str,
    attempt: int,
    max_retries: int,
) -> Optional[str]:
    labels, parsed_count = _parse_label_output(response, len(content_lines))
    if parsed_count > 0:
        candidate = _build_html_from_labels(content_lines, labels)
        if _is_grounded(cleaned_text, candidate):
            return candidate
        logger.warning(
            "Markup HTML not grounded for topic '%s' range %d (%d/%d), retrying",
            topic_name,
            topic_range.range_index,
            attempt,
            max_retries,
        )
    else:
        logger.warning(
            "Markup label parsing yielded no results for topic '%s' range %d (%d/%d)",
            topic_name,
            topic_range.range_index,
            attempt,
            max_retries,
        )

    return None


def _generate_grounded_html_for_range_parallel(
    topic_name: str,
    topic_range: TopicRange,
    llm: Any,
    max_retries: int,
    initial_response: str,
) -> str:
    cleaned_text = _cleanup_text_for_llm(topic_range.text)
    content_lines, numbered_text = _build_numbered_lines(cleaned_text)

    if not content_lines:
        return _build_plain_html(cleaned_text)

    if len(content_lines) == 1:
        return f"<p>{html_module.escape(content_lines[0], quote=False)}</p>"

    candidate = _render_markup_candidate(
        topic_name=topic_name,
        topic_range=topic_range,
        cleaned_text=cleaned_text,
        content_lines=content_lines,
        response=initial_response,
        attempt=1,
        max_retries=max_retries,
    )
    if candidate is not None:
        return candidate

    for attempt in range(1, max_retries):
        try:
            correction_prompt = MARKUP_CORRECTION_PROMPT_TEMPLATE.format(
                numbered_lines=numbered_text,
            )
            response = llm.call([correction_prompt], temperature=0.0)
            candidate = _render_markup_candidate(
                topic_name=topic_name,
                topic_range=topic_range,
                cleaned_text=cleaned_text,
                content_lines=content_lines,
                response=response,
                attempt=attempt + 1,
                max_retries=max_retries,
            )
            if candidate is not None:
                return candidate
        except Exception as exc:
            logger.warning(
                "Markup generation failed for topic '%s' range %d (%d/%d): %s",
                topic_name,
                topic_range.range_index,
                attempt + 1,
                max_retries,
                exc,
            )

        if attempt < max_retries - 1:
            time.sleep(float(attempt))

    logger.warning(
        "Markup falling back to plain HTML for topic '%s' range %d",
        topic_name,
        topic_range.range_index,
    )
    return _build_plain_html(cleaned_text)


def _submit_markup_range_request(
    topic_range: TopicRange,
    llm: Any,
) -> Optional[Any]:
    cleaned_text = _cleanup_text_for_llm(topic_range.text)
    content_lines, numbered_text = _build_numbered_lines(cleaned_text)

    if len(content_lines) <= 1:
        return None

    prompt = _build_markup_generation_prompt(numbered_text)
    submit = getattr(llm, "submit", None)
    if not callable(submit):
        return None
    return submit(prompt, 0.0)


def _process_topic(
    topic: Dict[str, Any],
    all_sentences: List[str],
    llm: Any,
    cache_store: Any,
    namespace: str,
    max_retries: int,
) -> Dict[str, Any]:
    topic_name = topic.get("name", "Unknown")
    ranges = _extract_topic_ranges(topic, all_sentences)
    if not ranges:
        return {"ranges": []}

    rendered_ranges: List[Dict[str, Any]] = []
    for topic_range in ranges:
        html = _generate_grounded_html_for_range(
            topic_name=topic_name,
            topic_range=topic_range,
            llm=llm,
            cache_store=cache_store,
            namespace=namespace,
            max_retries=max_retries,
        )
        rendered_ranges.append(
            {
                "range_index": topic_range.range_index,
                "sentence_start": topic_range.sentence_start,
                "sentence_end": topic_range.sentence_end,
                "html": html,
            }
        )

    return {"ranges": rendered_ranges}


def _process_topic_parallel(
    topic: Dict[str, Any],
    all_sentences: List[str],
    llm: Any,
    max_retries: int,
) -> Dict[str, Any]:
    topic_name = topic.get("name", "Unknown")
    ranges = _extract_topic_ranges(topic, all_sentences)
    if not ranges:
        return {"ranges": []}

    pending_ranges: List[tuple[TopicRange, Any]] = []
    for topic_range in ranges:
        future = _submit_markup_range_request(topic_range, llm)
        if future is not None:
            pending_ranges.append((topic_range, future))

    if pending_ranges:
        logger.info(
            "markup_generation: submitted %d ranges in parallel for topic '%s'",
            len(pending_ranges),
            topic_name,
        )

    resolved_html: Dict[int, str] = {}
    for topic_range, future in pending_ranges:
        response = future.result()
        resolved_html[topic_range.range_index] = (
            _generate_grounded_html_for_range_parallel(
                topic_name=topic_name,
                topic_range=topic_range,
                llm=llm,
                max_retries=max_retries,
                initial_response=response,
            )
        )

    rendered_ranges: List[Dict[str, Any]] = []
    for topic_range in ranges:
        html = resolved_html.get(topic_range.range_index)
        if html is None:
            html = _build_plain_html(_cleanup_text_for_llm(topic_range.text))
        rendered_ranges.append(
            {
                "range_index": topic_range.range_index,
                "sentence_start": topic_range.sentence_start,
                "sentence_end": topic_range.sentence_end,
                "html": html,
            }
        )

    return {"ranges": rendered_ranges}


def _process_all_topics_parallel(
    topics: List[Dict[str, Any]],
    all_sentences: List[str],
    llm: Any,
    max_retries: int,
) -> Dict[str, Any]:
    topic_ranges_map: Dict[str, List[TopicRange]] = {}
    pending_ranges: List[tuple[str, TopicRange, Any]] = []

    for index, topic in enumerate(topics):
        topic_name = topic.get("name", f"topic_{index}")
        ranges = _extract_topic_ranges(topic, all_sentences)
        topic_ranges_map[topic_name] = ranges
        for topic_range in ranges:
            future = _submit_markup_range_request(topic_range, llm)
            if future is not None:
                pending_ranges.append((topic_name, topic_range, future))

    if pending_ranges:
        logger.info(
            "markup_generation: submitted %d ranges in parallel across %d topics",
            len(pending_ranges),
            len(topic_ranges_map),
        )

    resolved_html: Dict[str, Dict[int, str]] = {}
    for topic_name, topic_range, future in pending_ranges:
        response = future.result()
        topic_resolved = resolved_html.setdefault(topic_name, {})
        topic_resolved[topic_range.range_index] = (
            _generate_grounded_html_for_range_parallel(
                topic_name=topic_name,
                topic_range=topic_range,
                llm=llm,
                max_retries=max_retries,
                initial_response=response,
            )
        )

    markup: Dict[str, Any] = {}
    for index, topic in enumerate(topics):
        topic_name = topic.get("name", f"topic_{index}")
        ranges = topic_ranges_map.get(topic_name, [])
        rendered_ranges: List[Dict[str, Any]] = []
        for topic_range in ranges:
            html = resolved_html.get(topic_name, {}).get(topic_range.range_index)
            if html is None:
                html = _build_plain_html(_cleanup_text_for_llm(topic_range.text))
            rendered_ranges.append(
                {
                    "range_index": topic_range.range_index,
                    "sentence_start": topic_range.sentence_start,
                    "sentence_end": topic_range.sentence_end,
                    "html": html,
                }
            )
        markup[topic_name] = {"ranges": rendered_ranges}

    return markup


def process_markup_generation(
    submission: Dict[str, Any],
    db: Any,
    llm: Any,
    max_retries: int = 3,
    cache_store: Any = None,
) -> None:
    """Generate grounded HTML markup for each topic range."""
    submission_id = submission["submission_id"]
    storage = SubmissionsStorage(db)
    results = submission.get("results", {})
    all_sentences: List[str] = results.get("sentences", [])
    topics: List[Dict[str, Any]] = results.get("topics", [])

    if not all_sentences or not topics:
        logger.warning(
            "[%s] markup_generation: no sentences or topics found, skipping",
            submission_id,
        )
        storage.update_results(submission_id, {"markup": {}})
        return

    namespace = _cache_namespace(llm)
    parallel_llm = (
        llm.with_namespace(namespace, prompt_version=_PROMPT_VERSION)
        if isinstance(llm, QueuedLLMClient)
        else llm
    )

    if _supports_parallel_submission(parallel_llm):
        for index, topic in enumerate(topics):
            topic_name = topic.get("name", f"topic_{index}")
            logger.info(
                "[%s] markup_generation: queueing topic %d/%d '%s'",
                submission_id,
                index + 1,
                len(topics),
                topic_name,
            )
        markup = _process_all_topics_parallel(
            topics=topics,
            all_sentences=all_sentences,
            llm=parallel_llm,
            max_retries=max_retries,
        )
    else:
        markup: Dict[str, Any] = {}
        for index, topic in enumerate(topics):
            topic_name = topic.get("name", f"topic_{index}")
            logger.info(
                "[%s] markup_generation: formatting topic %d/%d '%s'",
                submission_id,
                index + 1,
                len(topics),
                topic_name,
            )
            markup[topic_name] = _process_topic(
                topic=topic,
                all_sentences=all_sentences,
                llm=llm,
                cache_store=cache_store,
                namespace=namespace,
                max_retries=max_retries,
            )

    storage.update_results(submission_id, {"markup": markup})
    logger.info(
        "[%s] markup_generation: completed, formatted %d topics",
        submission_id,
        len(markup),
    )
