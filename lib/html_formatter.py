"""Preserve HTML formatting while extracting text for analysis"""
from html.parser import HTMLParser
from html import unescape
import re


class FormattingPreserver(HTMLParser):
    """
    Extract text while preserving formatting structure.
    Converts formatting tags to lightweight markers that can be reapplied later.
    """
    
    # Tags that create paragraph breaks
    BLOCK_TAGS = {'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                  'li', 'tr', 'blockquote', 'pre', 'article', 'section'}
    
    # Tags to preserve as inline formatting
    INLINE_TAGS = {'b', 'strong', 'i', 'em', 'u', 'mark', 'code', 'a'}
    
    def __init__(self):
        super().__init__()
        self._text_parts = []
        self._tag_stack = []
        self._word_count = 0
        self._word_to_format = {}  # word_index -> list of format tags
        
    def handle_starttag(self, tag, attrs):
        """Track opening tags"""
        tag_lower = tag.lower()
        
        if tag_lower in self.BLOCK_TAGS:
            # Add paragraph break marker
            if tag_lower == 'br':
                self._text_parts.append('\n')
            elif tag_lower in {'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'}:
                if self._text_parts and self._text_parts[-1] != '\n\n':
                    self._text_parts.append('\n\n')
            elif tag_lower == 'li':
                if self._text_parts and self._text_parts[-1] not in {'\n', '\n\n'}:
                    self._text_parts.append('\n')
                self._text_parts.append('• ')  # Bullet point
        
        if tag_lower in self.INLINE_TAGS:
            self._tag_stack.append(tag_lower)
    
    def handle_endtag(self, tag):
        """Track closing tags"""
        tag_lower = tag.lower()
        
        if tag_lower in self.INLINE_TAGS and tag_lower in self._tag_stack:
            self._tag_stack.remove(tag_lower)
        
        if tag_lower in {'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li'}:
            if self._text_parts and self._text_parts[-1] != '\n\n':
                self._text_parts.append('\n')
    
    def handle_data(self, data):
        """Process text content"""
        # Unescape HTML entities
        repeat = True
        while repeat:
            txt = unescape(data)
            if data == txt:
                repeat = False
            data = txt
        
        if data.strip():
            self._text_parts.append(data)
    
    def purge(self):
        """Reset state"""
        self._text_parts = []
        self._tag_stack = []
        self._word_count = 0
        self._word_to_format = {}
    
    def get_formatted_text(self):
        """Get text with preserved paragraph structure"""
        raw_text = ''.join(self._text_parts)
        
        # Normalize whitespace within paragraphs but preserve paragraph breaks
        lines = raw_text.split('\n')
        cleaned_lines = []
        
        for line in lines:
            # Clean up whitespace within each line
            cleaned = re.sub(r'\s+', ' ', line).strip()
            if cleaned:
                cleaned_lines.append(cleaned)
            elif cleaned_lines:  # Preserve empty lines between paragraphs
                cleaned_lines.append('')
        
        return '\n'.join(cleaned_lines)
    
    def get_plain_text(self):
        """Get plain text without any formatting (for LLM analysis)"""
        formatted = self.get_formatted_text()
        # Remove bullet points and collapse to single spaces
        plain = formatted.replace('•', '').replace('\n', ' ')
        return re.sub(r'\s+', ' ', plain).strip()


class HTMLWordExtractor(HTMLParser):
    """
    Walk raw HTML and produce two parallel word lists of identical length:
    - content_words: plain text words (for marker placement / LLM input)
    - html_words: same words wrapped with their inline tag context (for formatted output)
    Also tracks paragraph boundaries so downstream code can group sentences.
    """

    BLOCK_TAGS = {
        'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'li', 'tr', 'blockquote', 'pre', 'article', 'section',
        'header', 'footer', 'nav', 'aside', 'figure', 'figcaption',
        'ul', 'ol', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot',
    }

    INLINE_TAGS = {
        'strong', 'em', 'b', 'i', 'u', 'mark', 'code', 'a',
        'span', 'sub', 'sup', 'small', 'abbr', 'cite', 'q',
    }

    def __init__(self):
        super().__init__()
        self.content_words = []
        self.html_words = []
        self.word_to_paragraph = []
        self.paragraph_texts = []

        self._inline_stack = []       # list of (tag, attrs_dict)
        self._current_para_idx = 0
        self._para_has_words = False   # whether current paragraph has any words
        self._started = False          # whether we've seen any word at all

    # ------------------------------------------------------------------
    # HTMLParser callbacks
    # ------------------------------------------------------------------

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in self.BLOCK_TAGS:
            self._open_new_paragraph(tag)
        if tag in self.INLINE_TAGS:
            self._inline_stack.append((tag, dict(attrs)))

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in self.INLINE_TAGS:
            # Pop the most recent matching tag (handle nesting)
            for i in range(len(self._inline_stack) - 1, -1, -1):
                if self._inline_stack[i][0] == tag:
                    self._inline_stack.pop(i)
                    break
        if tag in self.BLOCK_TAGS:
            self._open_new_paragraph(tag)

    def handle_data(self, data):
        # Recursively unescape HTML entities
        text = data
        while True:
            unescaped = unescape(text)
            if unescaped == text:
                break
            text = unescaped

        words = text.split()
        if not words:
            return

        for w in words:
            self._started = True
            self._para_has_words = True
            self.content_words.append(w)
            self.html_words.append(self._wrap_word(w))
            self.word_to_paragraph.append(self._current_para_idx)

    def handle_entityref(self, name):
        self.handle_data(unescape(f'&{name};'))

    def handle_charref(self, name):
        self.handle_data(unescape(f'&#{name};'))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _open_new_paragraph(self, tag):
        """Start a new paragraph if the current one already has words."""
        if self._para_has_words:
            # Snapshot the paragraph text before moving on
            self._snapshot_paragraph()
            self._current_para_idx += 1
            self._para_has_words = False

    def _snapshot_paragraph(self):
        """Build plain-text paragraph string from content_words in current para."""
        para_words = [
            self.content_words[i]
            for i in range(len(self.content_words))
            if self.word_to_paragraph[i] == self._current_para_idx
        ]
        self.paragraph_texts.append(' '.join(para_words))

    def _wrap_word(self, word):
        """Wrap a plain word with currently-open inline tags (outermost first)."""
        result = word
        # Apply tags from innermost (most recent) to outermost
        for tag, attrs in self._inline_stack:
            attr_str = self._build_attr_string(attrs)
            result = f'<{tag}{attr_str}>{result}</{tag}>'
        return result

    @staticmethod
    def _build_attr_string(attrs):
        """Build an HTML attribute string from a dict."""
        if not attrs:
            return ''
        parts = []
        for k, v in attrs.items():
            if v is None:
                parts.append(f' {k}')
            else:
                escaped = v.replace('&', '&amp;').replace('"', '&quot;')
                parts.append(f' {k}="{escaped}"')
        return ''.join(parts)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract(self, html: str):
        """Parse HTML and populate word lists. Returns self for chaining."""
        self.feed(html)
        # Snapshot the last paragraph if it has words
        if self._para_has_words:
            self._snapshot_paragraph()
        return self


def preserve_formatting_in_text(html_content):
    """
    Extract text while preserving paragraph breaks and basic formatting.
    Returns both formatted text (for display) and plain text (for analysis).
    """
    parser = FormattingPreserver()
    parser.feed(html_content)

    formatted_text = parser.get_formatted_text()
    plain_text = parser.get_plain_text()

    return formatted_text, plain_text


