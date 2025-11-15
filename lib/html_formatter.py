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


def reconstruct_with_formatting(words, word_ranges, formatted_text):
    """
    Reconstruct sentences from word ranges while preserving original formatting.
    
    Args:
        words: List of words from plain text analysis
        word_ranges: List of (start_word_idx, end_word_idx) tuples
        formatted_text: Original formatted text with paragraph breaks
    
    Returns:
        List of formatted sentence strings
    """
    # Build mapping from plain words back to formatted text
    formatted_words = formatted_text.split()
    plain_words = ' '.join(formatted_text.split()).split()
    
    sentences = []
    for start_idx, end_idx in word_ranges:
        if 0 <= start_idx <= end_idx < len(words):
            # Extract the sentence with formatting preserved
            sentence_words = words[start_idx:end_idx + 1]
            sentence = ' '.join(sentence_words)
            sentences.append(sentence)
    
    return sentences
