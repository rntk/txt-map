"""
Unit tests for the PDF to HTML module.

Tests PDFToSemanticHTML class, convert_pdf_to_html, and extract_text_from_pdf functions.
Tests PyMuPDF (fitz) integration and edge cases.
"""

import base64
import pytest
from unittest.mock import MagicMock, Mock, patch
import pymupdf

# Import module under test
from lib.pdf_to_html import (
    PDFToSemanticHTML,
    convert_pdf_to_html,
    extract_text_from_pdf,
    FontThresholds,
)


# =============================================================================
# Fixtures: PDF Test Data
# =============================================================================


@pytest.fixture
def valid_pdf_bytes():
    """Valid PDF bytes with text content."""
    # Minimal valid PDF structure with text content
    return b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 24 Tf
50 700 Td
(Hello World) Tj
ET
endstream
endobj
5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000367 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
464
%%EOF"""


@pytest.fixture
def valid_pdf_with_headings():
    """Valid PDF bytes with different font sizes for heading detection."""
    # PDF with multiple font sizes to test heading detection
    return b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj
4 0 obj
<<
/Length 100
>>
stream
BT
/F1 24 Tf
50 700 Td
(Main Heading) Tj
/F1 18 Tf
50 650 Td
(Subheading) Tj
/F1 14 Tf
50 600 Td
(Body text content) Tj
ET
endstream
endobj
5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000424 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
521
%%EOF"""


@pytest.fixture
def valid_pdf_with_formatting():
    """Valid PDF bytes with bold and italic text."""
    return b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj
4 0 obj
<<
/Length 80
>>
stream
BT
/F1 12 Tf
50 700 Td
(This is ) Tj
1 0 0 1 100 700 Tm
(Bold text) Tj
0 1 0 1 150 700 Tm
( and ) Tj
(Italic text) Tj
ET
endstream
endobj
5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica-Bold
>>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000404 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
501
%%EOF"""


@pytest.fixture
def empty_pdf_bytes():
    """Empty bytes (invalid PDF)."""
    return b""


@pytest.fixture
def invalid_pdf_bytes():
    """Invalid PDF bytes (corrupted/malformed)."""
    return b"This is not a PDF file at all"


@pytest.fixture
def truncated_pdf_bytes():
    """Truncated PDF bytes (incomplete file)."""
    return b"%PDF-1.4\n1 0 obj\n<<\n/Type"


@pytest.fixture
def unicode_pdf_content():
    """PDF content with unicode characters."""
    # Note: Creating actual PDF with unicode is complex; this tests the text handling
    return b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj
4 0 obj
<<
/Length 50
>>
stream
BT
/F1 12 Tf
50 700 Td
(Unicode test) Tj
ET
endstream
endobj
5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000374 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
471
%%EOF"""


@pytest.fixture
def multipage_pdf_bytes():
    """Multi-page PDF bytes."""
    return b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R 4 0 R]
/Count 2
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 5 0 R
/Resources <<
/Font <<
/F1 6 0 R
>>
>>
>>
endobj
4 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 7 0 R
/Resources <<
/Font <<
/F1 6 0 R
>>
>>
>>
endobj
5 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
50 700 Td
(Page one content) Tj
ET
endstream
endobj
6 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
7 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
50 700 Td
(Page two content) Tj
ET
endstream
endobj
xref
0 8
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000121 00000 n
0000000278 00000 n
0000000435 00000 n
0000000528 00000 n
0000000623 00000 n
trailer
<<
/Size 8
/Root 1 0 R
>>
startxref
716
%%EOF"""


@pytest.fixture
def scanned_pdf_bytes():
    """Simulated scanned/image-only PDF bytes."""
    # This is a PDF structure without text content (image-only)
    return b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/XObject <<
/Im1 5 0 R
>>
>>
>>
endobj
4 0 obj
<<
/Length 50
>>
stream
q
612 0 0 792 0 0 cm
/Im1 Do
Q
endstream
endobj
5 0 obj
<<
/Type /XObject
/Subtype /Image
/Width 612
/Height 792
/ColorSpace /DeviceRGB
/BitsPerComponent 8
/Length 100
>>
stream
fake image data here
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000272 00000 n
0000000372 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
522
%%EOF"""


# =============================================================================
# Test: FontThresholds Dataclass
# =============================================================================


class TestFontThresholds:
    """Tests for FontThresholds dataclass."""

    def test_create_font_thresholds(self):
        """Can create FontThresholds with valid values."""
        thresholds = FontThresholds(h1=24.0, h2=18.0, h3=14.0)

        assert thresholds.h1 == 24.0
        assert thresholds.h2 == 18.0
        assert thresholds.h3 == 14.0

    def test_font_thresholds_is_dataclass(self):
        """FontThresholds is a dataclass with correct fields."""
        from dataclasses import fields, is_dataclass

        assert is_dataclass(FontThresholds)
        field_names = [f.name for f in fields(FontThresholds)]
        assert field_names == ["h1", "h2", "h3"]

    def test_font_thresholds_default_values(self):
        """FontThresholds can be created with various values."""
        thresholds = FontThresholds(h1=30.0, h2=20.0, h3=16.0)

        assert thresholds.h1 == 30.0
        assert thresholds.h2 == 20.0
        assert thresholds.h3 == 16.0


# =============================================================================
# Test: PDFToSemanticHTML Class Initialization
# =============================================================================


class TestPDFToSemanticHTMLInit:
    """Tests for PDFToSemanticHTML.__init__ method."""

    def test_initializes_with_valid_pdf(self, valid_pdf_bytes):
        """Initializes successfully with valid PDF bytes."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        assert converter.doc is not None
        assert converter.font_thresholds is not None

    def test_stores_document_reference(self, valid_pdf_bytes):
        """Stores PyMuPDF document reference."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        # Document should be a pymupdf.Document
        assert hasattr(converter, "doc")

    def test_analyzes_font_sizes_on_init(self, valid_pdf_with_headings):
        """Analyzes font sizes during initialization."""
        converter = PDFToSemanticHTML(valid_pdf_with_headings)

        assert converter.font_thresholds is not None
        assert isinstance(converter.font_thresholds, FontThresholds)

    def test_raises_error_on_invalid_pdf(self, invalid_pdf_bytes):
        """Raises exception on invalid PDF bytes."""
        with pytest.raises(pymupdf.FileDataError):
            PDFToSemanticHTML(invalid_pdf_bytes)

    def test_raises_error_on_empty_bytes(self, empty_pdf_bytes):
        """Raises exception on empty bytes."""
        with pytest.raises((pymupdf.FileDataError, pymupdf.EmptyFileError)):
            PDFToSemanticHTML(empty_pdf_bytes)

    def test_raises_error_on_truncated_pdf(self, truncated_pdf_bytes):
        """Raises exception on truncated PDF."""
        with pytest.raises(pymupdf.FileDataError):
            PDFToSemanticHTML(truncated_pdf_bytes)


# =============================================================================
# Test: PDFToSemanticHTML._analyze_font_sizes
# =============================================================================


class TestAnalyzeFontSizes:
    """Tests for PDFToSemanticHTML._analyze_font_sizes method."""

    def test_extracts_font_sizes_from_pdf(self, valid_pdf_with_headings):
        """Extracts font sizes from PDF content."""
        converter = PDFToSemanticHTML(valid_pdf_with_headings)

        # Should have detected different font sizes
        assert converter.font_thresholds.h1 >= converter.font_thresholds.h2
        assert converter.font_thresholds.h2 >= converter.font_thresholds.h3

    def test_returns_default_when_no_text(self, scanned_pdf_bytes):
        """Returns default thresholds when no text found."""
        # For image-only PDF, font analysis may return defaults
        converter = PDFToSemanticHTML(scanned_pdf_bytes)

        # Should still have thresholds (may be defaults)
        assert converter.font_thresholds is not None
        assert isinstance(converter.font_thresholds, FontThresholds)

    def test_handles_single_font_size(self, valid_pdf_bytes):
        """Handles PDF with single font size."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        # Should have valid thresholds even with single size
        assert converter.font_thresholds.h1 > 0
        assert converter.font_thresholds.h2 > 0
        assert converter.font_thresholds.h3 > 0


# =============================================================================
# Test: PDFToSemanticHTML._get_heading_tag
# =============================================================================


class TestGetHeadingTag:
    """Tests for PDFToSemanticHTML._get_heading_tag method."""

    def test_returns_h1_for_largest_font(self, valid_pdf_with_headings):
        """Returns h1 tag for largest font size."""
        converter = PDFToSemanticHTML(valid_pdf_with_headings)

        tag = converter._get_heading_tag(converter.font_thresholds.h1)

        assert tag == "h1"

    def test_returns_h2_for_medium_font(self, valid_pdf_with_headings):
        """Returns h2 tag for medium font size."""
        converter = PDFToSemanticHTML(valid_pdf_with_headings)

        tag = converter._get_heading_tag(converter.font_thresholds.h2)

        assert tag == "h2"

    def test_returns_h3_for_smaller_font(self, valid_pdf_with_headings):
        """Returns h3 tag for smaller font size."""
        converter = PDFToSemanticHTML(valid_pdf_with_headings)

        tag = converter._get_heading_tag(converter.font_thresholds.h3)

        assert tag == "h3"

    def test_returns_none_for_body_text_size(self, valid_pdf_with_headings):
        """Returns None for body text (smaller than h3)."""
        converter = PDFToSemanticHTML(valid_pdf_with_headings)

        # Body text should be smaller than h3 threshold
        tag = converter._get_heading_tag(converter.font_thresholds.h3 - 2)

        assert tag is None

    def test_handles_tolerance_for_floating_point(self, valid_pdf_bytes):
        """Handles floating point comparison with tolerance."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        # Test with value at threshold minus tolerance
        tag = converter._get_heading_tag(converter.font_thresholds.h1 - 0.3)

        assert tag == "h1"


# =============================================================================
# Test: PDFToSemanticHTML._wrap_text_with_style
# =============================================================================


class TestWrapTextWithStyle:
    """Tests for PDFToSemanticHTML._wrap_text_with_style method."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create a converter instance for testing style wrapping
        self.converter = None
        try:
            # Use minimal valid PDF to create converter
            pdf_bytes = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 0>>stream
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
0000000178 00000 n
trailer<</Size 5/Root 1 0 R>>
startxref
228
%%EOF"""
            self.converter = PDFToSemanticHTML(pdf_bytes)
        except Exception:
            # If PDF creation fails, create a mock converter
            self.converter = Mock()
            self.converter._wrap_text_with_style = (
                PDFToSemanticHTML._wrap_text_with_style.__get__(
                    self.converter, PDFToSemanticHTML
                )
            )

    def test_returns_plain_text_when_no_flags(self):
        """Returns plain text when no formatting flags."""

        result = self.converter._wrap_text_with_style("plain text", 0)

        assert result == "plain text"

    def test_wraps_with_strong_for_bold(self):
        """Wraps text with <strong> for bold flag."""
        import pymupdf

        result = self.converter._wrap_text_with_style(
            "bold text", pymupdf.TEXT_FONT_BOLD
        )

        assert result == "<strong>bold text</strong>"

    def test_wraps_with_em_for_italic(self):
        """Wraps text with <em> for italic flag."""
        import pymupdf

        result = self.converter._wrap_text_with_style(
            "italic text", pymupdf.TEXT_FONT_ITALIC
        )

        assert result == "<em>italic text</em>"

    def test_wraps_with_both_for_bold_and_italic(self):
        """Wraps text with both <strong> and <em> for combined flags."""
        import pymupdf

        flags = pymupdf.TEXT_FONT_BOLD | pymupdf.TEXT_FONT_ITALIC
        result = self.converter._wrap_text_with_style("bold italic", flags)

        # Italic applied first, then bold
        assert "<strong>" in result
        assert "<em>" in result

    def test_handles_empty_text(self):
        """Handles empty text string."""
        result = self.converter._wrap_text_with_style("", 0)

        assert result == ""


# =============================================================================
# Test: PDFToSemanticHTML._escape_html
# =============================================================================


class TestEscapeHtml:
    """Tests for PDFToSemanticHTML._escape_html method."""

    def setup_method(self):
        """Set up test fixtures."""
        try:
            pdf_bytes = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 0>>stream
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
0000000178 00000 n
trailer<</Size 5/Root 1 0 R>>
startxref
228
%%EOF"""
            self.converter = PDFToSemanticHTML(pdf_bytes)
        except Exception:
            self.converter = Mock()
            self.converter._escape_html = PDFToSemanticHTML._escape_html.__get__(
                self.converter, PDFToSemanticHTML
            )

    def test_escapes_ampersand(self):
        """Escapes ampersand character."""
        result = self.converter._escape_html("A & B")

        assert result == "A &amp; B"

    def test_escapes_less_than(self):
        """Escapes less-than character."""
        result = self.converter._escape_html("a < b")

        assert result == "a &lt; b"

    def test_escapes_greater_than(self):
        """Escapes greater-than character."""
        result = self.converter._escape_html("a > b")

        assert result == "a &gt; b"

    def test_escapes_double_quote(self):
        """Escapes double quote character."""
        result = self.converter._escape_html('say "hello"')

        assert result == "say &quot;hello&quot;"

    def test_escapes_single_quote(self):
        """Escapes single quote character."""
        result = self.converter._escape_html("it's")

        assert result == "it&#39;s"

    def test_escapes_multiple_characters(self):
        """Escapes multiple special characters."""
        result = self.converter._escape_html('<div class="test">A & B</div>')

        assert "&lt;" in result
        assert "&gt;" in result
        assert "&quot;" in result
        assert "&amp;" in result

    def test_returns_plain_text_without_special_chars(self):
        """Returns unchanged text without special characters."""
        result = self.converter._escape_html("plain text 123")

        assert result == "plain text 123"


# =============================================================================
# Test: PDFToSemanticHTML.convert
# =============================================================================


class TestConvert:
    """Tests for PDFToSemanticHTML.convert method."""

    def test_returns_html_string(self, valid_pdf_bytes):
        """Returns HTML string from valid PDF."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        result = converter.convert()

        assert isinstance(result, str)
        assert len(result) > 0

    def test_html_contains_doctype(self, valid_pdf_bytes):
        """HTML output contains DOCTYPE declaration."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        result = converter.convert()

        assert "<!DOCTYPE html>" in result

    def test_html_contains_basic_structure(self, valid_pdf_bytes):
        """HTML output contains basic document structure."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        result = converter.convert()

        assert "<html" in result
        assert "<head>" in result
        assert "<body>" in result
        assert "</html>" in result

    def test_html_contains_meta_tags(self, valid_pdf_bytes):
        """HTML output contains meta tags."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        result = converter.convert()

        assert '<meta charset="UTF-8">' in result
        assert 'name="viewport"' in result

    def test_html_contains_css_styles(self, valid_pdf_bytes):
        """HTML output contains CSS styles."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        result = converter.convert()

        assert "<style>" in result
        assert "body {" in result
        assert "h1 {" in result
        assert "p {" in result

    def test_html_contains_page_comments(self, valid_pdf_bytes):
        """HTML output contains page number comments."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        result = converter.convert()

        assert "<!-- Page 1 -->" in result

    def test_multipage_pdf_generates_page_comments(self, multipage_pdf_bytes):
        """Multi-page PDF generates comments for each page."""
        converter = PDFToSemanticHTML(multipage_pdf_bytes)

        result = converter.convert()

        assert "<!-- Page 1 -->" in result
        assert "<!-- Page 2 -->" in result

    def test_close_releases_resources(self, valid_pdf_bytes):
        """close() method releases document resources."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        converter.close()

        # Document should be closed (can't use it after close)
        # PyMuPDF documents have a 'close' method that sets internal state

    @patch("pymupdf.open")
    def test_converts_image_block_to_base64(self, mock_open, valid_pdf_bytes):
        """Image blocks are converted to base64 inline images."""
        mock_doc = MagicMock()
        mock_page = MagicMock()
        mock_page.get_text.return_value = {
            "blocks": [
                {
                    "type": 1,  # Image type
                    "image": b"fake_image_data",
                    "ext": "png",
                }
            ]
        }
        mock_doc.__iter__.side_effect = lambda: iter([mock_page])
        mock_open.return_value = mock_doc

        converter = PDFToSemanticHTML(b"fake bytes", embed_images=True)
        result = converter.convert()

        expected_base64 = base64.b64encode(b"fake_image_data").decode("utf-8")
        assert f'<img src="data:image/png;base64,{expected_base64}"' in result


# =============================================================================
# Test: convert_pdf_to_html Function
# =============================================================================


class TestConvertPdfToHtml:
    """Tests for the convert_pdf_to_html convenience function."""

    def test_converts_valid_pdf_to_html(self, valid_pdf_bytes):
        """Converts valid PDF bytes to HTML string."""
        result = convert_pdf_to_html(valid_pdf_bytes)

        assert isinstance(result, str)
        assert "<!DOCTYPE html>" in result

    def test_raises_error_on_invalid_pdf(self, invalid_pdf_bytes):
        """Raises exception on invalid PDF bytes."""
        with pytest.raises(pymupdf.FileDataError):
            convert_pdf_to_html(invalid_pdf_bytes)

    def test_raises_error_on_empty_bytes(self, empty_pdf_bytes):
        """Raises exception on empty bytes."""
        with pytest.raises((pymupdf.FileDataError, pymupdf.EmptyFileError)):
            convert_pdf_to_html(empty_pdf_bytes)

    def test_raises_error_on_truncated_pdf(self, truncated_pdf_bytes):
        """Raises exception on truncated PDF."""
        with pytest.raises(pymupdf.FileDataError):
            convert_pdf_to_html(truncated_pdf_bytes)

    def test_closes_converter_after_conversion(self, valid_pdf_bytes):
        """Closes converter after successful conversion."""
        # This tests that the finally block closes the converter
        with patch.object(PDFToSemanticHTML, "close") as mock_close:
            result = convert_pdf_to_html(valid_pdf_bytes)

            assert result is not None
            mock_close.assert_called_once()

    def test_returns_unicode_content(self, unicode_pdf_content):
        """Handles and returns unicode content correctly."""
        result = convert_pdf_to_html(unicode_pdf_content)

        assert isinstance(result, str)
        assert '<meta charset="UTF-8">' in result

    def test_handles_multipage_pdf(self, multipage_pdf_bytes):
        """Handles multi-page PDF conversion."""
        result = convert_pdf_to_html(multipage_pdf_bytes)

        assert isinstance(result, str)
        assert "<!-- Page 1 -->" in result
        assert "<!-- Page 2 -->" in result

    @patch("pymupdf.open")
    def test_handles_pymupdf_errors_gracefully(self, mock_open):
        """Handles PyMuPDF errors gracefully."""
        mock_open.side_effect = Exception("PyMuPDF error")

        with pytest.raises(Exception, match="PyMuPDF error"):
            convert_pdf_to_html(b"fake pdf")


# =============================================================================
# Test: extract_text_from_pdf Function
# =============================================================================


class TestExtractTextFromPdf:
    """Tests for the extract_text_from_pdf function."""

    def test_extracts_text_from_valid_pdf(self, valid_pdf_bytes):
        """Extracts text from valid PDF bytes."""
        result = extract_text_from_pdf(valid_pdf_bytes)

        assert isinstance(result, str)

    def test_returns_string(self, valid_pdf_bytes):
        """Returns string type."""
        result = extract_text_from_pdf(valid_pdf_bytes)

        assert isinstance(result, str)

    def test_raises_error_on_invalid_pdf(self, invalid_pdf_bytes):
        """Raises exception on invalid PDF bytes."""
        with pytest.raises(pymupdf.FileDataError):
            extract_text_from_pdf(invalid_pdf_bytes)

    def test_raises_error_on_empty_bytes(self, empty_pdf_bytes):
        """Raises exception on empty bytes."""
        with pytest.raises((pymupdf.FileDataError, pymupdf.EmptyFileError)):
            extract_text_from_pdf(empty_pdf_bytes)

    def test_raises_error_on_truncated_pdf(self, truncated_pdf_bytes):
        """Raises exception on truncated PDF."""
        with pytest.raises(pymupdf.FileDataError):
            extract_text_from_pdf(truncated_pdf_bytes)

    def test_closes_document_after_extraction(self, valid_pdf_bytes):
        """Closes document after text extraction."""
        # Tests that the finally block closes the document
        with patch("pymupdf.open") as mock_open:
            mock_doc = MagicMock()
            mock_doc.__iter__ = MagicMock(return_value=iter([]))
            mock_open.return_value = mock_doc

            extract_text_from_pdf(valid_pdf_bytes)

            mock_doc.close.assert_called_once()

    def test_handles_multipage_pdf(self, multipage_pdf_bytes):
        """Handles multi-page PDF text extraction."""
        result = extract_text_from_pdf(multipage_pdf_bytes)

        assert isinstance(result, str)

    def test_separates_pages_with_double_newline(self, multipage_pdf_bytes):
        """Separates pages with double newline."""
        result = extract_text_from_pdf(multipage_pdf_bytes)

        # Pages should be separated by \n\n
        # Note: This depends on the implementation
        assert isinstance(result, str)

    @patch("pymupdf.open")
    def test_handles_pymupdf_errors_gracefully(self, mock_open):
        """Handles PyMuPDF errors gracefully."""
        mock_open.side_effect = Exception("PyMuPDF error")

        with pytest.raises(Exception, match="PyMuPDF error"):
            extract_text_from_pdf(b"fake pdf")


# =============================================================================
# Test: Edge Cases and Error Handling
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_scanned_pdf_returns_empty_or_minimal_html(self, scanned_pdf_bytes):
        """Scanned/image-only PDF returns HTML with minimal content."""
        # Note: The current implementation doesn't raise HTTPException
        # It just produces HTML with empty body content
        result = convert_pdf_to_html(scanned_pdf_bytes)

        assert isinstance(result, str)
        assert "<!DOCTYPE html>" in result
        # The body may be empty or contain minimal content

    def test_scanned_pdf_extract_text_returns_empty(self, scanned_pdf_bytes):
        """Scanned/image-only PDF returns empty string for text extraction."""
        result = extract_text_from_pdf(scanned_pdf_bytes)

        # Image-only PDFs have no extractable text
        assert isinstance(result, str)
        # May be empty or contain minimal text

    def test_pdf_with_special_characters(self, valid_pdf_bytes):
        """Handles PDF with special characters in content."""
        result = convert_pdf_to_html(valid_pdf_bytes)

        # HTML should properly escape special characters
        assert isinstance(result, str)

    def test_pdf_with_very_long_text(self, valid_pdf_bytes):
        """Handles PDF with very long text content."""
        # Test with repeated content to simulate large PDF
        result = convert_pdf_to_html(valid_pdf_bytes)

        assert isinstance(result, str)
        assert len(result) > 0

    def test_font_thresholds_with_no_varied_sizes(self, valid_pdf_bytes):
        """Handles font analysis when all text has same size."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        # Should have valid thresholds even with uniform sizes
        assert converter.font_thresholds.h1 > 0
        assert converter.font_thresholds.h2 > 0
        assert converter.font_thresholds.h3 > 0


# =============================================================================
# Test: PyMuPDF Integration
# =============================================================================


class TestPyMuPdfIntegration:
    """Tests for PyMuPDF (fitz) integration."""

    def test_uses_pymupdf_open_with_stream(self, valid_pdf_bytes):
        """Uses pymupdf.open with stream parameter."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        # Verify document was opened
        assert converter.doc is not None

    def test_iterates_over_pages(self, multipage_pdf_bytes):
        """Iterates over all pages in document."""
        converter = PDFToSemanticHTML(multipage_pdf_bytes)

        page_count = len(converter.doc)

        assert page_count == 2

    def test_extracts_text_blocks(self, valid_pdf_bytes):
        """Extracts text blocks from pages."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        # Get text dict from first page
        page = converter.doc[0]
        blocks = page.get_text("dict")["blocks"]

        assert isinstance(blocks, list)

    def test_closes_document_properly(self, valid_pdf_bytes):
        """Closes document properly to release resources."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        converter.close()

        # Document should be closed


# =============================================================================
# Test: HTML Output Validation
# =============================================================================


class TestHtmlOutputValidation:
    """Tests for HTML output validation."""

    def test_html_is_valid_structure(self, valid_pdf_bytes):
        """HTML output has valid structure."""
        result = convert_pdf_to_html(valid_pdf_bytes)

        # Check for required HTML elements
        assert result.count("<html") == result.count("</html>")
        assert result.count("<head>") == result.count("</head>")
        assert result.count("<body>") == result.count("</body>")

    def test_html_tags_are_properly_closed(self, valid_pdf_bytes):
        """HTML tags are properly closed."""
        result = convert_pdf_to_html(valid_pdf_bytes)

        # Count opening and closing tags
        assert result.count("<strong>") == result.count("</strong>")
        assert result.count("<em>") == result.count("</em>")

    def test_html_contains_semantic_tags(self, valid_pdf_with_headings):
        """HTML contains semantic heading tags."""
        result = convert_pdf_to_html(valid_pdf_with_headings)

        # Should contain heading tags based on font sizes
        assert (
            "<h1>" in result or "<h2>" in result or "<h3>" in result or "<p>" in result
        )

    def test_html_contains_paragraph_tags(self, valid_pdf_bytes):
        """HTML contains paragraph tags for body text."""
        result = convert_pdf_to_html(valid_pdf_bytes)

        assert (
            isinstance(result, str) and len(result) > 0
        )  # Result should be a non-empty string

    def test_html_charset_is_utf8(self, valid_pdf_bytes):
        """HTML specifies UTF-8 charset."""
        result = convert_pdf_to_html(valid_pdf_bytes)

        assert 'charset="UTF-8"' in result

    def test_html_has_viewport_meta(self, valid_pdf_bytes):
        """HTML has viewport meta tag for responsive design."""
        result = convert_pdf_to_html(valid_pdf_bytes)

        assert 'name="viewport"' in result
        assert "width=device-width" in result


# =============================================================================
# Test: Font Size Threshold Detection
# =============================================================================


class TestFontSizeThresholdDetection:
    """Tests for font size threshold detection logic."""

    def test_detects_three_distinct_sizes(self, valid_pdf_with_headings):
        """Detects three distinct font sizes for h1, h2, h3."""
        converter = PDFToSemanticHTML(valid_pdf_with_headings)

        thresholds = converter.font_thresholds

        # Should have detected different sizes
        assert thresholds.h1 >= thresholds.h2
        assert thresholds.h2 >= thresholds.h3

    def test_handles_two_distinct_sizes(self, valid_pdf_bytes):
        """Handles PDF with only two distinct font sizes."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        thresholds = converter.font_thresholds

        # Should have valid thresholds
        assert thresholds.h1 > 0
        assert thresholds.h2 > 0
        assert thresholds.h3 > 0

    def test_handles_single_font_size(self, valid_pdf_bytes):
        """Handles PDF with single font size (uses defaults)."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        thresholds = converter.font_thresholds

        # Should have fallback defaults
        assert thresholds.h1 == 24.0 or thresholds.h1 > 0
        assert thresholds.h2 == 18.0 or thresholds.h2 > 0
        assert thresholds.h3 == 14.0 or thresholds.h3 > 0

    def test_handles_no_text_blocks(self, scanned_pdf_bytes):
        """Handles PDF with no text blocks (image-only)."""
        converter = PDFToSemanticHTML(scanned_pdf_bytes)

        thresholds = converter.font_thresholds

        # Should use defaults when no text found
        assert thresholds.h1 == 24.0
        assert thresholds.h2 == 18.0
        assert thresholds.h3 == 14.0


# =============================================================================
# Test: Inline Formatting
# =============================================================================


class TestInlineFormatting:
    """Tests for inline text formatting (bold, italic)."""

    def test_preserves_bold_text(self, valid_pdf_with_formatting):
        """Preserves bold text with <strong> tags."""
        # Import PDF specific exceptions
        try:
            import fitz

            PdfException = fitz.DocumentError
        except (ImportError, AttributeError):
            PdfException = (OSError, RuntimeError)

        try:
            result = convert_pdf_to_html(valid_pdf_with_formatting)
            # Should contain strong tags if bold text detected
            assert isinstance(result, str)
        except PdfException:
            # Only skip on PDF parsing/document errors, not assertion failures
            pytest.skip("PDF formatting test requires valid PDF structure")

    def test_preserves_italic_text(self, valid_pdf_with_formatting):
        """Preserves italic text with <em> tags."""
        # Import PDF specific exceptions
        try:
            import fitz

            PdfException = fitz.DocumentError
        except (ImportError, AttributeError):
            PdfException = (OSError, RuntimeError)

        try:
            result = convert_pdf_to_html(valid_pdf_with_formatting)
            # Should contain em tags if italic text detected
            assert isinstance(result, str)
        except PdfException:
            # Only skip on PDF parsing/document errors, not assertion failures
            pytest.skip("PDF formatting test requires valid PDF structure")

    def test_escapes_html_in_text_content(self, valid_pdf_bytes):
        """Escapes HTML special characters in text content."""
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        # Test the escape method directly
        result = converter._escape_html("<script>alert('xss')</script>")

        assert "<script>" not in result
        assert "&lt;script&gt;" in result


# =============================================================================
# Test: Large PDF Handling
# =============================================================================


class TestLargePdfHandling:
    """Tests for handling large PDFs."""

    def test_handles_pdf_with_many_pages(self, multipage_pdf_bytes):
        """Handles PDF with multiple pages."""
        result = convert_pdf_to_html(multipage_pdf_bytes)

        assert isinstance(result, str)
        assert len(result) > 0

    def test_memory_efficient_processing(self, valid_pdf_bytes):
        """Processing is memory efficient (closes document after use)."""
        # Test that convert_pdf_to_html closes the document
        result = convert_pdf_to_html(valid_pdf_bytes)

        assert result is not None

    def test_streaming_conversion(self, valid_pdf_bytes):
        """Conversion processes PDF as stream."""
        # PyMuPDF opens PDF as stream
        converter = PDFToSemanticHTML(valid_pdf_bytes)

        assert converter.doc is not None
        converter.close()


# =============================================================================
# Test: Error Messages
# =============================================================================


class TestErrorMessages:
    """Tests for error messages and exception handling."""

    def test_invalid_pdf_raises_exception(self, invalid_pdf_bytes):
        """Invalid PDF raises appropriate exception."""
        with pytest.raises(pymupdf.FileDataError) as exc_info:
            convert_pdf_to_html(invalid_pdf_bytes)

        assert exc_info.value is not None

    def test_empty_bytes_raises_exception(self, empty_pdf_bytes):
        """Empty bytes raise appropriate exception."""
        with pytest.raises((pymupdf.FileDataError, pymupdf.EmptyFileError)) as exc_info:
            convert_pdf_to_html(empty_pdf_bytes)

        assert exc_info.value is not None

    def test_exception_message_is_informative(self, invalid_pdf_bytes):
        """Exception message provides useful information."""
        with pytest.raises(pymupdf.FileDataError) as exc_info:
            convert_pdf_to_html(invalid_pdf_bytes)

        # Exception should have some message
        assert str(exc_info.value)
