"""Remove all html tags"""
from html.parser import HTMLParser
from html import unescape


class HTMLCleaner(HTMLParser):
    """Remove all html tags"""

    def __init__(self):
        super().__init__()
        self._strings = []
        self._error = None

    def handle_data(self, data):
        """Add data to strings"""
        repeat = True
        while repeat:
            txt = unescape(data)
            if data == txt:
                repeat = False
            data = txt

        self._strings.append(data)

    def purge(self):
        """Clear state"""
        self._strings = []

    def get_content(self):
        """Get clean content"""
        return self._strings

    def clean(self, html_content: str) -> str:
        """Parse HTML and return normalized plain text."""
        self.purge()
        if html_content:
            self.feed(html_content)
            self.close()
        content = " ".join(self._strings)
        # Collapse whitespace for downstream processing.
        return " ".join(content.split())

    def error(self, error):
        """Save last error"""
        self._error = error
