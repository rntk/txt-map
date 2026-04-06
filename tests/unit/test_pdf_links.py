from lib.pdf_to_html import convert_pdf_to_html
import pymupdf


def test_convert_pdf_with_links():
    # Create a simple PDF with a link
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Click here", fontsize=12)
    # Define a link rect around "Click here"
    link_rect = pymupdf.Rect(50, 40, 150, 60)
    page.insert_link(
        {"kind": pymupdf.LINK_URI, "uri": "https://example.com", "from": link_rect}
    )

    pdf_bytes = doc.write()
    doc.close()

    html = convert_pdf_to_html(pdf_bytes)
    assert 'href="https://example.com"' in html
    assert "Click here" in html
    assert 'target="_blank" rel="noopener noreferrer"' in html


def test_convert_pdf_with_internal_links():
    # Create a 2-page PDF with an internal LINK_GOTO from page 1 to page 2
    doc = pymupdf.open()
    doc.new_page().insert_text((50, 50), "Go to page 2", fontsize=12)
    doc.new_page().insert_text((50, 50), "You are on page 2", fontsize=12)

    # Re-fetch page 1 after both pages exist (stale references after new_page)
    link_rect = pymupdf.Rect(50, 40, 150, 60)
    # LINK_GOTO: 'page' is 0-indexed target page
    doc[0].insert_link({"kind": pymupdf.LINK_GOTO, "page": 1, "from": link_rect})

    pdf_bytes = doc.write()
    doc.close()

    html = convert_pdf_to_html(pdf_bytes)
    assert 'href="#page-2"' in html
    assert 'id="page-2"' in html
    assert "Go to page 2" in html
    assert "You are on page 2" in html
