"""
FB2 (FictionBook 2) to Semantic HTML converter using stdlib only.

FB2 is an XML-based e-book format. This module parses the XML and produces
semantic HTML with headings and paragraphs, plus a plain-text extraction.
"""
import xml.etree.ElementTree as ET
from html import escape
from typing import List, Optional, Tuple

FB2_NS = "http://www.gribuser.ru/xml/fictionbook/2.0"
_NS = f"{{{FB2_NS}}}"


def _tag(local: str) -> str:
    return f"{_NS}{local}"


def _find_body(root: ET.Element) -> Optional[ET.Element]:
    """Return the main <body> element, handling namespace presence or absence."""
    # With namespace
    body = root.find(_tag("body"))
    if body is not None:
        return body
    # Without namespace (some files omit it)
    return root.find("body")


def _local(element: ET.Element) -> str:
    """Return the local tag name without namespace."""
    tag = element.tag
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


def _inline_html(element: ET.Element) -> str:
    """Render an element's inline content (text + children) as HTML."""
    parts: List[str] = []
    if element.text:
        parts.append(escape(element.text))
    for child in element:
        local = _local(child)
        inner = _inline_html(child)
        if local == "emphasis":
            parts.append(f"<em>{inner}</em>")
        elif local == "strong":
            parts.append(f"<strong>{inner}</strong>")
        elif local in ("a", "strikethrough"):
            parts.append(inner)
        else:
            parts.append(inner)
        if child.tail:
            parts.append(escape(child.tail))
    return "".join(parts)


def _section_to_html(section: ET.Element, depth: int, html_parts: List[str]) -> None:
    """Recursively convert a <section> element to HTML blocks."""
    heading_tag = "h1" if depth <= 1 else ("h2" if depth == 2 else "h3")

    for child in section:
        local = _local(child)

        if local == "title":
            # Collect all <p> children of the title
            title_texts: List[str] = []
            for p in child:
                if _local(p) == "p":
                    title_texts.append(_inline_html(p))
            text = " ".join(title_texts).strip()
            if text:
                html_parts.append(f"<{heading_tag}>{text}</{heading_tag}>")

        elif local == "subtitle":
            text = _inline_html(child).strip()
            if text:
                html_parts.append(f"<h3>{text}</h3>")

        elif local == "p":
            text = _inline_html(child).strip()
            if text:
                html_parts.append(f"<p>{text}</p>")

        elif local == "epigraph":
            for p in child:
                if _local(p) == "p":
                    text = _inline_html(p).strip()
                    if text:
                        html_parts.append(f"<p><em>{text}</em></p>")

        elif local == "empty-line":
            pass  # skip decorative spacing

        elif local == "section":
            _section_to_html(child, depth + 1, html_parts)


def _section_to_text(section: ET.Element, text_parts: List[str]) -> None:
    """Recursively extract plain text from a <section> element."""
    for child in section:
        local = _local(child)

        if local == "title":
            for p in child:
                if _local(p) == "p":
                    text = "".join(p.itertext()).strip()
                    if text:
                        text_parts.append(text)

        elif local in ("subtitle", "p"):
            text = "".join(child.itertext()).strip()
            if text:
                text_parts.append(text)

        elif local == "epigraph":
            for p in child:
                if _local(p) == "p":
                    text = "".join(p.itertext()).strip()
                    if text:
                        text_parts.append(text)

        elif local == "section":
            _section_to_text(child, text_parts)


def _parse_fb2(fb2_bytes: bytes) -> Tuple[ET.Element, ET.Element]:
    """Parse FB2 bytes and return (root, body)."""
    root = ET.fromstring(fb2_bytes)
    body = _find_body(root)
    if body is None:
        raise ValueError("No <body> element found in FB2 file.")
    return root, body


_HTML_SHELL = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E-book</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }}
        h1 {{ font-size: 2em; margin-top: 1em; margin-bottom: 0.5em; }}
        h2 {{ font-size: 1.5em; margin-top: 1em; margin-bottom: 0.5em; }}
        h3 {{ font-size: 1.25em; margin-top: 1em; margin-bottom: 0.5em; }}
        p {{ margin: 0.5em 0; }}
        strong {{ font-weight: 600; }}
        em {{ font-style: italic; }}
    </style>
</head>
<body>
{body}
</body>
</html>"""


def convert_fb2_to_html(fb2_bytes: bytes) -> str:
    """
    Convert FB2 bytes to semantic HTML.

    Args:
        fb2_bytes: Raw FB2 file bytes

    Returns:
        Semantic HTML string
    """
    _, body = _parse_fb2(fb2_bytes)
    html_parts: List[str] = []

    for child in body:
        local = _local(child)
        if local == "section":
            _section_to_html(child, 1, html_parts)
        elif local == "title":
            for p in child:
                if _local(p) == "p":
                    text = _inline_html(p).strip()
                    if text:
                        html_parts.append(f"<h1>{text}</h1>")

    return _HTML_SHELL.format(body="\n".join(html_parts))


def extract_text_from_fb2(fb2_bytes: bytes) -> str:
    """
    Extract plain text from FB2 bytes.

    Args:
        fb2_bytes: Raw FB2 file bytes

    Returns:
        Plain text string
    """
    _, body = _parse_fb2(fb2_bytes)
    text_parts: List[str] = []

    for child in body:
        local = _local(child)
        if local == "section":
            _section_to_text(child, text_parts)
        elif local == "title":
            for p in child:
                if _local(p) == "p":
                    text = "".join(p.itertext()).strip()
                    if text:
                        text_parts.append(text)

    return "\n\n".join(text_parts)
