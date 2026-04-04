"""
EPUB to Semantic HTML converter using stdlib only.

EPUB is a ZIP archive containing XHTML chapter files and an OPF manifest.
This module reads chapters in spine order and produces semantic HTML,
plus a plain-text extraction.
"""

import io
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Tuple

# Common XML namespaces used in EPUB
_OPF_NS = "http://www.idpf.org/2007/opf"
_CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"
_XHTML_NS = "http://www.w3.org/1999/xhtml"


def _find_opf_path(zf: zipfile.ZipFile) -> str:
    """Parse META-INF/container.xml to find the OPF file path."""
    try:
        container_data = zf.read("META-INF/container.xml")
    except KeyError:
        raise ValueError("Invalid EPUB: missing META-INF/container.xml")

    root = ET.fromstring(container_data)
    # Try with namespace
    rootfile = root.find(f".//{{{_CONTAINER_NS}}}rootfile")
    if rootfile is None:
        # Try without namespace
        rootfile = root.find(".//rootfile")
    if rootfile is None:
        raise ValueError("Invalid EPUB: could not find rootfile in container.xml")

    opf_path = rootfile.get("full-path")
    if not opf_path:
        raise ValueError("Invalid EPUB: rootfile has no full-path attribute")
    return opf_path


def _get_spine_items(zf: zipfile.ZipFile, opf_path: str) -> List[Tuple[str, str]]:
    """
    Parse the OPF file and return a list of (item_id, href) in spine reading order.
    hrefs are resolved relative to the OPF directory.
    """
    try:
        opf_data = zf.read(opf_path)
    except KeyError:
        raise ValueError(f"Invalid EPUB: could not read OPF file at {opf_path}")

    opf_dir = opf_path.rsplit("/", 1)[0] if "/" in opf_path else ""
    root = ET.fromstring(opf_data)

    # Build manifest: id -> href
    manifest: dict = {}
    manifest_el = root.find(f"{{{_OPF_NS}}}manifest") or root.find("manifest")
    if manifest_el is not None:
        for item in manifest_el:
            item_id = item.get("id", "")
            href = item.get("href", "")
            media_type = item.get("media-type", "")
            if (
                media_type in ("application/xhtml+xml", "text/html")
                and item_id
                and href
            ):
                manifest[item_id] = href

    # Get spine order
    spine_el = root.find(f"{{{_OPF_NS}}}spine") or root.find("spine")
    spine_items: List[Tuple[str, str]] = []
    if spine_el is not None:
        for itemref in spine_el:
            idref = itemref.get("idref", "")
            if idref in manifest:
                href = manifest[idref]
                # Resolve href relative to OPF directory
                if opf_dir:
                    full_href = f"{opf_dir}/{href}"
                else:
                    full_href = href
                spine_items.append((idref, full_href))

    return spine_items


_BODY_RE = re.compile(
    r"<body[^>]*>(.*?)</body>",
    re.DOTALL | re.IGNORECASE,
)

_TAG_RE = re.compile(r"<[^>]+>")


def _extract_body_html(xhtml_bytes: bytes) -> str:
    """Extract the inner content of <body> from an XHTML document."""
    try:
        text = xhtml_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""
    match = _BODY_RE.search(text)
    if match:
        return match.group(1).strip()
    # Fallback: strip all tags
    return _TAG_RE.sub("", text).strip()


def _extract_body_text(xhtml_bytes: bytes) -> str:
    """Extract plain text from an XHTML document."""
    try:
        text = xhtml_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""
    # Remove script/style blocks first
    text = re.sub(
        r"<(script|style)[^>]*>.*?</(script|style)>",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    # Strip all tags
    text = _TAG_RE.sub(" ", text)
    # Collapse whitespace
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


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


def convert_epub_to_html(epub_bytes: bytes) -> str:
    """
    Convert EPUB bytes to semantic HTML.

    Args:
        epub_bytes: Raw EPUB file bytes

    Returns:
        Semantic HTML string
    """
    with zipfile.ZipFile(io.BytesIO(epub_bytes)) as zf:
        opf_path = _find_opf_path(zf)
        spine_items = _get_spine_items(zf, opf_path)

        chapter_parts: List[str] = []
        for _, href in spine_items:
            # Normalize path separators and handle URL-encoded characters
            normalized = href.replace("%20", " ")
            try:
                chapter_data = zf.read(normalized)
            except KeyError:
                # Some EPUBs use slightly different paths; try without leading slash
                try:
                    chapter_data = zf.read(normalized.lstrip("/"))
                except KeyError:
                    continue
            body_html = _extract_body_html(chapter_data)
            if body_html:
                chapter_parts.append(body_html)

    if not chapter_parts:
        return _HTML_SHELL.format(body="")

    body_content = "\n<hr>\n".join(chapter_parts)
    return _HTML_SHELL.format(body=body_content)


def extract_text_from_epub(epub_bytes: bytes) -> str:
    """
    Extract plain text from EPUB bytes.

    Args:
        epub_bytes: Raw EPUB file bytes

    Returns:
        Plain text string
    """
    with zipfile.ZipFile(io.BytesIO(epub_bytes)) as zf:
        opf_path = _find_opf_path(zf)
        spine_items = _get_spine_items(zf, opf_path)

        text_parts: List[str] = []
        for _, href in spine_items:
            normalized = href.replace("%20", " ")
            try:
                chapter_data = zf.read(normalized)
            except KeyError:
                try:
                    chapter_data = zf.read(normalized.lstrip("/"))
                except KeyError:
                    continue
            text = _extract_body_text(chapter_data)
            if text:
                text_parts.append(text)

    return "\n\n".join(text_parts)
