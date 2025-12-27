"""
Article splitting utilities for converting articles into structured segments.
"""
import re
from typing import List, Tuple, Dict, Optional
from lib.html_formatter import FormattingPreserver


def split_article_with_markers(article: str, llm) -> Tuple[List[str], List[str], Dict[int, int], List[str], int, List[int]]:
    """
    Split an article into sentences using a hybrid marker-based approach.
    
    This function:
    1. Extracts formatted and plain text from HTML
    2. Splits text into words and adds numbered markers after punctuation or every N words
    3. Returns the marked text, words, and mapping information needed for downstream processing
    
    Args:
        article: The article text (may contain HTML formatting)
        llm: LLM client instance (used for token estimation and chunking)
    
    Returns:
        Tuple containing:
        - sentences: List of sentence strings (built from marked text ranges)
        - words: List of individual words from the plain text
        - paragraph_map: Dict mapping sentence index to paragraph index
        - paragraph_texts: List of paragraph texts (preserving formatting)
        - marker_count: Total number of markers added
        - marker_word_indices: List mapping marker number to word index
    """
    # Extract both formatted and plain text
    formatter = FormattingPreserver()
    formatter.feed(article)
    formatted_text = formatter.get_formatted_text()
    plain_text = formatter.get_plain_text()
    
    # Use plain text for LLM analysis
    text = plain_text
    
    # Split formatted text into paragraphs for tracking
    paragraphs = []
    paragraph_texts = []
    for para in formatted_text.split('\n\n'):
        para = para.strip()
        if para:
            paragraphs.append(para)
            paragraph_texts.append(para)
    
    # Split text into words and add numbered markers
    words = text.split()
    if not words:
        return [], [], {}, [], 0, []
    
    print(f"\n=== DEBUG: Total words: {len(words)} ===")
    print(f"First 10 words: {words[:10]}")
    
    # Create marked text with hybrid marker approach:
    # - Add marker after punctuation characters
    # - Add marker every N words if no punctuation encountered (backup)
    # Using |#N#| format where N is the marker position number
    WORDS_PER_MARKER = 15  # Backup marker interval
    PUNCTUATION_CHARS = {'.', ',', ';', ':', '!', '?', ')', ']', '}'}
    
    marked_parts = []
    marker_count = 0
    words_since_last_marker = 0
    # Map marker number -> word index after which the marker is placed
    # Example: if marker 1 is placed after word index 14, marker_word_indices[0] == 14
    marker_word_indices = []
    
    for i, word in enumerate(words):
        marked_parts.append(word)
        words_since_last_marker += 1
        
        # Check if word ends with punctuation
        has_punctuation = any(word.rstrip().endswith(p) for p in PUNCTUATION_CHARS)
        
        # Add marker if:
        # 1. Word has punctuation, OR
        # 2. We've passed N words without a marker
        if has_punctuation or words_since_last_marker >= WORDS_PER_MARKER:
            if i < len(words) - 1:  # Don't add marker after the last word
                marker_count += 1
                marked_parts.append(f"|#{marker_count}#|")
                marker_word_indices.append(i)
                words_since_last_marker = 0
    
    marked_text = " ".join(marked_parts)
    
    print(f"\n=== DEBUG: Hybrid marker approach ===")
    print(f"Total markers added: {marker_count} (vs {len(words)-1} with per-word marking)")
    if marker_count > 0 and len(words) > 1:
        print(f"Marker reduction: {((len(words)-1-marker_count)/(len(words)-1)*100):.1f}%")
    print(f"Marked text (first 500 chars): {marked_text[:500]}")
    print(f"... (total length: {len(marked_text)} chars)")
    
    # Build paragraph mapping
    paragraph_map = {}
    
    # Create word-to-paragraph mapping from formatted text
    word_to_paragraph = []
    for para_idx, para_text in enumerate(paragraph_texts):
        para_words = para_text.split()
        word_to_paragraph.extend([para_idx] * len(para_words))
    
    # Return the components needed for further processing
    # Note: sentences will be built later from marker ranges
    return [], words, paragraph_map, paragraph_texts, marker_count, marker_word_indices, marked_text, word_to_paragraph


def build_sentences_from_ranges(
    marker_ranges: List[Tuple[int, int]],
    words: List[str],
    marker_count: int,
    marker_word_indices: List[int],
    word_to_paragraph: List[int],
    paragraph_texts: List[str]
) -> Tuple[List[str], Dict[int, Optional[Tuple[int, int]]], Dict[int, int], Dict[int, int]]:
    """
    Build sentences from marker ranges and create mappings.
    
    Args:
        marker_ranges: List of (start_marker, end_marker) tuples
        words: List of words from the article
        marker_count: Total number of markers
        marker_word_indices: List mapping marker numbers to word indices
        word_to_paragraph: List mapping word index to paragraph index
        paragraph_texts: List of paragraph texts
    
    Returns:
        Tuple containing:
        - sentences: List of sentence strings
        - sentence_range_map: Dict mapping sentence index to (start_marker, end_marker) or None
        - sentence_start_word: Dict mapping sentence index to starting word index
        - paragraph_map: Dict mapping sentence index to paragraph index
    """
    # Helpers to convert MARKER numbers to word indices
    def marker_to_word_start(m: int) -> int:
        if m == 0:
            return 0
        if 1 <= m <= marker_count:
            return marker_word_indices[m - 1] + 1
        return len(words)

    def marker_to_word_end(m: int) -> int:
        if m >= marker_count:
            return len(words) - 1
        if m >= 1:
            return marker_word_indices[m - 1]
        return -1

    # Validate ranges and convert to word positions
    valid_ranges_with_positions = []
    for start_marker, end_marker in marker_ranges:
        if start_marker < 0 or end_marker < 0:
            continue
        if end_marker < start_marker:
            continue
        if start_marker > marker_count or end_marker > marker_count:
            continue

        word_start = marker_to_word_start(start_marker)
        word_end = marker_to_word_end(end_marker)

        if 0 <= word_start <= word_end < len(words):
            valid_ranges_with_positions.append((word_start, word_end, start_marker, end_marker))
    
    # Sort by word_start position
    valid_ranges_with_positions.sort(key=lambda x: x[0])
    
    # Build sentences by interleaving gaps and covered ranges
    sentences = []
    sentence_range_map = {}
    sentence_start_word = {}
    paragraph_map = {}

    merged_segments = []
    cursor = 0
    for word_start, word_end, start_marker, end_marker in valid_ranges_with_positions:
        if word_start > cursor:
            # gap before this covered range
            merged_segments.append((cursor, word_start - 1, None))
        # covered range
        merged_segments.append((word_start, word_end, (start_marker, end_marker)))
        cursor = word_end + 1
    # trailing gap
    if cursor <= len(words) - 1:
        merged_segments.append((cursor, len(words) - 1, None))

    # Minimum sentence length thresholds
    MIN_SENTENCE_WORDS = 5
    MIN_SENTENCE_CHARS = 30
    
    print(f"\n=== DEBUG: Building sentences with minimum thresholds: {MIN_SENTENCE_WORDS} words, {MIN_SENTENCE_CHARS} chars ===")
    
    for seg_word_start, seg_word_end, seg_range in merged_segments:
        if seg_word_start > seg_word_end:
            continue
        sentence = " ".join(words[seg_word_start:seg_word_end + 1]).strip()
        if not sentence:
            continue
        
        # Calculate sentence metrics
        word_count = seg_word_end - seg_word_start + 1
        char_count = len(sentence)
        
        # Check if this sentence is too short
        is_too_short = word_count < MIN_SENTENCE_WORDS or char_count < MIN_SENTENCE_CHARS
        
        # If sentence is too short and we have a previous sentence, merge with previous
        if is_too_short and len(sentences) > 0:
            print(f"=== DEBUG: Merging short sentence ({word_count} words, {char_count} chars): '{sentence[:50]}...' ===")
            # Merge with previous sentence
            prev_idx = len(sentences) - 1
            sentences[prev_idx] = sentences[prev_idx] + " " + sentence
            
            # Update the range map if both have ranges
            if seg_range is not None:
                prev_range = sentence_range_map[prev_idx]
                if prev_range is not None:
                    # Extend the range to include this segment
                    sentence_range_map[prev_idx] = (prev_range[0], seg_range[1])
                else:
                    # Previous was a gap, now it has a range
                    sentence_range_map[prev_idx] = seg_range
            # Note: sentence_start_word stays the same (start of previous sentence)
            # paragraph_map stays the same (paragraph of previous sentence)
        else:
            # Add as new sentence
            sentence_idx = len(sentences)
            sentences.append(sentence)
            sentence_range_map[sentence_idx] = seg_range
            sentence_start_word[sentence_idx] = seg_word_start
            
            # Map sentence to paragraph
            if seg_word_start < len(word_to_paragraph):
                paragraph_map[sentence_idx] = word_to_paragraph[seg_word_start]
            else:
                paragraph_map[sentence_idx] = len(paragraph_texts) - 1 if paragraph_texts else 0

    print(f"=== DEBUG: Built {len(sentences)} sentences after merging short ones ===")
    return sentences, sentence_range_map, sentence_start_word, paragraph_map


def chunk_marked_text(marked_text: str, llm, prompt_template: str) -> List[str]:
    """
    Split marked text into chunks that fit within the LLM's context window.
    
    Args:
        marked_text: Text with |#N#| markers
        llm: LLM client instance
        prompt_template: The prompt template to account for in token calculation
    
    Returns:
        List of text chunks
    """
    # Calculate how much space we have for text
    template_tokens = llm.estimate_tokens(prompt_template.replace("{text_chunk}", ""))
    max_text_tokens = llm._LLamaCPP__max_context_tokens - template_tokens - 500  # 500 token buffer
    
    estimated_text_tokens = llm.estimate_tokens(marked_text)
    print(f"\n=== DEBUG: Estimated tokens - template: {template_tokens}, text: {estimated_text_tokens}, max for text: {max_text_tokens} ===")
    
    chunks = []
    if estimated_text_tokens <= max_text_tokens:
        chunks = [marked_text]
        print(f"=== DEBUG: Text fits in one chunk ===")
    else:
        # Need to split text into chunks
        chunk_char_size = max_text_tokens * 4  # ~4 chars per token
        
        # Find all marker positions
        marker_positions = []
        i = 0
        while True:
            pos = marked_text.find('|#', i)
            if pos == -1:
                break
            marker_positions.append(pos)
            i = pos + 1
        
        print(f"=== DEBUG: Found {len(marker_positions)} markers, need to split into chunks ===")
        
        # Create chunks based on character size, but split at marker boundaries
        current_chunk_start = 0
        chunk_start_marker_idx = 0
        
        for i, marker_pos in enumerate(marker_positions):
            if marker_pos - current_chunk_start >= chunk_char_size:
                chunk = marked_text[current_chunk_start:marker_pos].strip()
                if chunk:
                    chunks.append(chunk)
                    print(f"=== DEBUG: Created chunk {len(chunks)}: {len(chunk)} chars, markers {chunk_start_marker_idx} to ~{i} ===")
                current_chunk_start = marker_pos
                chunk_start_marker_idx = i
        
        # Add the last chunk
        if current_chunk_start < len(marked_text):
            chunk = marked_text[current_chunk_start:].strip()
            if chunk:
                chunks.append(chunk)
                print(f"=== DEBUG: Created final chunk {len(chunks)}: {len(chunk)} chars ===")
    
    return chunks
