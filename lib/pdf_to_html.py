"""
PDF to Semantic HTML converter using PyMuPDF.

Extracts text with font information and generates semantic HTML
with proper headings (<h1>, <h2>, <h3>), paragraphs (<p>),
and inline formatting (<strong>, <em>).
"""
import pymupdf
from typing import Tuple, List, Optional
from dataclasses import dataclass


@dataclass
class FontThresholds:
    """Font size thresholds for heading detection."""
    h1: float
    h2: float
    h3: float


class PDFToSemanticHTML:
    """Convert PDF to semantic HTML with proper heading and text tags."""

    def __init__(self, pdf_bytes: bytes):
        self.doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        self.font_thresholds = self._analyze_font_sizes()

    def _analyze_font_sizes(self) -> FontThresholds:
        """
        Analyze font sizes across document to determine heading thresholds.
        Uses distribution of unique font sizes to detect heading levels.
        """
        all_sizes: List[float] = []

        for page in self.doc:
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if block.get("type") != 0:  # Skip non-text blocks
                    continue
                if "lines" not in block:
                    continue
                for line in block["lines"]:
                    for span in line["spans"]:
                        size = span.get("size", 0)
                        if size > 0:
                            all_sizes.append(size)

        if not all_sizes:
            return FontThresholds(h1=24.0, h2=18.0, h3=14.0)

        # Get unique sizes sorted descending
        unique_sizes = sorted(set(all_sizes), reverse=True)

        # Determine thresholds based on size distribution
        if len(unique_sizes) >= 3:
            return FontThresholds(
                h1=unique_sizes[0],
                h2=unique_sizes[1],
                h3=unique_sizes[2]
            )
        elif len(unique_sizes) == 2:
            return FontThresholds(
                h1=unique_sizes[0],
                h2=unique_sizes[1],
                h3=unique_sizes[1] - 1
            )
        else:
            return FontThresholds(h1=24.0, h2=18.0, h3=14.0)

    def _get_heading_tag(self, font_size: float) -> Optional[str]:
        """Determine heading tag based on font size relative to thresholds."""
        t = self.font_thresholds
        # Use small tolerance for floating point comparison
        tolerance = 0.5
        if font_size >= t.h1 - tolerance:
            return "h1"
        elif font_size >= t.h2 - tolerance:
            return "h2"
        elif font_size >= t.h3 - tolerance:
            return "h3"
        return None

    def _wrap_text_with_style(self, text: str, flags: int) -> str:
        """Wrap text with <strong> and <em> tags based on font flags."""
        # Apply italic first, then bold (for proper nesting)
        if flags & pymupdf.TEXT_FONT_ITALIC:
            text = f"<em>{text}</em>"
        if flags & pymupdf.TEXT_FONT_BOLD:
            text = f"<strong>{text}</strong>"
        return text

    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters."""
        return (text
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                .replace("'", "&#39;"))

    def convert(self) -> str:
        """
        Convert entire PDF to semantic HTML.
        
        Returns a complete HTML document with semantic structure.
        """
        html_parts: List[str] = []

        for page_num, page in enumerate(self.doc):
            blocks = page.get_text("dict")["blocks"]
            page_html: List[str] = []
            current_paragraph: List[str] = []

            for block in blocks:
                if block.get("type") != 0:  # Skip non-text blocks (images, etc.)
                    continue
                if "lines" not in block:
                    continue

                for line in block["lines"]:
                    spans = line.get("spans", [])
                    if not spans:
                        continue

                    # Get the maximum font size in this line
                    line_size = max(span.get("size", 0) for span in spans)

                    # Flush any accumulated paragraph before heading
                    heading_tag = self._get_heading_tag(line_size)

                    if current_paragraph and heading_tag:
                        para_text = "".join(current_paragraph)
                        if para_text.strip():
                            page_html.append(f"<p>{para_text}</p>")
                        current_paragraph = []

                    if heading_tag:
                        # Combine all spans for heading
                        heading_text = "".join(
                            self._escape_html(span["text"])
                            for span in spans
                        )
                        if heading_text.strip():
                            page_html.append(f"<{heading_tag}>{heading_text}</{heading_tag}>")
                    else:
                        # Build paragraph content with inline formatting
                        line_parts: List[str] = []
                        for span in spans:
                            escaped_text = self._escape_html(span.get("text", ""))
                            flags = span.get("flags", 0)
                            styled_text = self._wrap_text_with_style(escaped_text, flags)
                            line_parts.append(styled_text)

                        if line_parts:
                            current_paragraph.append("".join(line_parts) + " ")

            # Flush any remaining paragraph
            if current_paragraph:
                para_text = "".join(current_paragraph).strip()
                if para_text:
                    page_html.append(f"<p>{para_text}</p>")

            if page_html:
                html_parts.append(f"<!-- Page {page_num + 1} -->\n" + "\n".join(page_html))

        # Wrap in basic HTML document structure
        body_content = "\n".join(html_parts)
        full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF Conversion</title>
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
{body_content}
</body>
</html>"""

        return full_html

    def close(self):
        """Close the document and release resources."""
        self.doc.close()


def convert_pdf_to_html(pdf_bytes: bytes) -> str:
    """
    Convenience function to convert PDF bytes to semantic HTML.
    
    Args:
        pdf_bytes: Raw PDF file bytes
        
    Returns:
        Semantic HTML string
    """
    converter = PDFToSemanticHTML(pdf_bytes)
    try:
        return converter.convert()
    finally:
        converter.close()


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract plain text from PDF (fallback for text_content).
    
    Args:
        pdf_bytes: Raw PDF file bytes
        
    Returns:
        Plain text string
    """
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        pages = []
        for page in doc:
            text = page.get_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages)
    finally:
        doc.close()
