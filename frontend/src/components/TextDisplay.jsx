import React from 'react';
import { sanitizeHTML } from '../utils/sanitize';

function isInAnyRange(start, end, ranges) {
  return ranges.some(r => start < r.end && end > r.start);
}

function wrapWord(htmlWord, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges) {
  const wordEnd = wordStart + htmlWord.length;

  if (!isInAnyRange(wordStart, wordEnd, allTopicRanges)) {
    return htmlWord;
  }

  const classes = ['word-token'];
  if (isInAnyRange(wordStart, wordEnd, highlightRanges)) {
    classes.push('highlighted');
  } else if (isInAnyRange(wordStart, wordEnd, fadeRanges)) {
    classes.push('faded');
  }

  return `<span class="${classes.join(' ')}" data-article-index="${articleIndex}" data-char-start="${wordStart}" data-char-end="${wordEnd}">${htmlWord}</span>`;
}

function buildHighlightedRawHtml(rawHtml, articleTopics, articleIndex, highlightRanges, fadeRanges) {
  if (!rawHtml) return '';

  const safeTopics = Array.isArray(articleTopics) ? articleTopics : [];
  const allTopicRanges = [];
  safeTopics.forEach(topic => {
    (Array.isArray(topic.ranges) ? topic.ranges : []).forEach(range => {
      const s = Number(range.start);
      const e = Number(range.end);
      if (Number.isFinite(s) && Number.isFinite(e)) {
        allTopicRanges.push({ start: s, end: e });
      }
    });
  });

  if (allTopicRanges.length === 0) {
    return sanitizeHTML(rawHtml);
  }

  // Scan the raw HTML string character by character.
  // The ranges are in raw-HTML-string coordinates, so we work directly
  // with the string to match positions correctly.
  let result = '';
  let inTag = false;
  let inQuote = false;
  let quoteChar = '';
  let wordBuffer = '';
  let wordStart = -1;

  for (let i = 0; i < rawHtml.length; i++) {
    const ch = rawHtml[i];

    if (inTag) {
      if (inQuote) {
        if (ch === quoteChar) inQuote = false;
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === '>') {
        inTag = false;
      }
      result += ch;
    } else if (ch === '<') {
      // Flush any accumulated word before entering tag
      if (wordBuffer) {
        result += wrapWord(wordBuffer, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges);
        wordBuffer = '';
        wordStart = -1;
      }
      inTag = true;
      result += ch;
    } else {
      // Text content
      if (/\s/.test(ch)) {
        // Whitespace: flush word buffer
        if (wordBuffer) {
          result += wrapWord(wordBuffer, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges);
          wordBuffer = '';
          wordStart = -1;
        }
        result += ch;
      } else {
        // Non-whitespace: accumulate into word
        if (wordStart === -1) wordStart = i;
        wordBuffer += ch;
      }
    }
  }

  // Flush remaining word
  if (wordBuffer) {
    result += wrapWord(wordBuffer, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges);
  }

  // Sanitize the final HTML (preserves our span wrappers with data-* attrs)
  return sanitizeHTML(result);
}

function TextDisplay({ sentences, selectedTopics, hoveredTopic, readTopics, articleTopics, articleIndex, paragraphMap, topicSummaries, onShowTopicSummary, rawHtml }) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  const safeSelectedTopics = Array.isArray(selectedTopics) ? selectedTopics : [];
  const safeArticleTopics = Array.isArray(articleTopics) ? articleTopics : [];
  const readTopicsSet = readTopics instanceof Set ? readTopics : new Set(readTopics || []);
  const safeParagraphMap = paragraphMap && typeof paragraphMap === 'object' ? paragraphMap : null;

  // Build character ranges from topic.ranges (in raw HTML string coordinates)
  const highlightRanges = [];
  const fadeRanges = [];

  safeArticleTopics.forEach(topic => {
    const ranges = Array.isArray(topic.ranges) ? topic.ranges : [];
    if (ranges.length === 0) return;

    const isHighlighted = safeSelectedTopics.some(t => t.name === topic.name) ||
      (hoveredTopic && hoveredTopic.name === topic.name);
    const isFaded = readTopicsSet.has(topic.name);

    ranges.forEach(range => {
      const rangeStart = Number(range.start);
      const rangeEnd = Number(range.end);
      if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return;

      if (isHighlighted) {
        highlightRanges.push({ start: rangeStart, end: rangeEnd });
      } else if (isFaded) {
        fadeRanges.push({ start: rangeStart, end: rangeEnd });
      }
    });
  });

  // Sentence-index-based sets for non-rawHtml fallback paths
  const fadedIndices = new Set();
  readTopicsSet.forEach(topicName => {
    const relatedTopic = safeArticleTopics.find(t => t.name === topicName);
    if (relatedTopic) {
      relatedTopic.sentences.forEach(num => fadedIndices.add(num - 1));
    }
  });

  const highlightedIndices = new Set();
  safeSelectedTopics.forEach(topic => {
    const relatedTopic = safeArticleTopics.find(t => t.name === topic.name);
    if (relatedTopic) {
      relatedTopic.sentences.forEach(num => highlightedIndices.add(num - 1));
    }
  });
  if (hoveredTopic) {
    const relatedTopic = safeArticleTopics.find(t => t.name === hoveredTopic.name);
    if (relatedTopic) {
      relatedTopic.sentences.forEach(num => highlightedIndices.add(num - 1));
    }
  }

  const highlightedRawHtml = buildHighlightedRawHtml(
    rawHtml,
    safeArticleTopics,
    articleIndex,
    highlightRanges,
    fadeRanges
  );

  const sentenceToTopicsEnding = new Map();
  safeArticleTopics.forEach(topic => {
    if (topic.sentences && topic.sentences.length > 0) {
      const lastSentenceIndex = Math.max(...topic.sentences) - 1;
      if (!sentenceToTopicsEnding.has(lastSentenceIndex)) {
        sentenceToTopicsEnding.set(lastSentenceIndex, []);
      }
      sentenceToTopicsEnding.get(lastSentenceIndex).push(topic);
    }
  });

  if (highlightedRawHtml) {
    return (
      <div className="text-display">
        <div
          className="text-content"
          dangerouslySetInnerHTML={{ __html: highlightedRawHtml }}
        />
      </div>
    );
  }

  if (safeParagraphMap && Object.keys(safeParagraphMap).length > 0) {
    const paragraphGroups = new Map();

    safeSentences.forEach((sentence, idx) => {
      const sentenceParagraphIdx = safeParagraphMap[idx] !== undefined ? safeParagraphMap[idx] : 0;

      if (!paragraphGroups.has(sentenceParagraphIdx)) {
        paragraphGroups.set(sentenceParagraphIdx, []);
      }

      paragraphGroups.get(sentenceParagraphIdx).push({ text: sentence, index: idx });
    });

    const sortedParagraphIndices = Array.from(paragraphGroups.keys()).sort((a, b) => a - b);
    const paragraphs = sortedParagraphIndices.map(paraIdx => paragraphGroups.get(paraIdx));

    return (
      <div className="text-display">
        <div className="text-content">
          {paragraphs.map((para, paraIdx) => (
            <p key={paraIdx} className="article-paragraph">
              {para.map(({ text, index }) => (
                <React.Fragment key={index}>
                  <div
                    id={`sentence-${articleIndex}-${index}`}
                    data-article-index={articleIndex}
                    data-sentence-index={index}
                    className={`sentence-token ${highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}`}
                    dangerouslySetInnerHTML={{ __html: sanitizeHTML(text) + ' ' }}
                  />
                  {sentenceToTopicsEnding.has(index) && topicSummaries && onShowTopicSummary && (
                    sentenceToTopicsEnding.get(index).map((topic, tIdx) => (
                      <button
                        key={`${index}-${tIdx}`}
                        className="topic-summary-link"
                        onClick={() => onShowTopicSummary(topic, topicSummaries[topic.name])}
                        title={`View summary for topic: ${topic.name}`}
                      >
                        [📝 {topic.name}]
                      </button>
                    ))
                  )}
                </React.Fragment>
              ))}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="text-display">
      <div className="text-content">
        <p className="article-text">
          {safeSentences.map((sentence, index) => (
            <React.Fragment key={index}>
              <div
                id={`sentence-${articleIndex}-${index}`}
                data-article-index={articleIndex}
                data-sentence-index={index}
                className={`sentence-token ${highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}`}
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(sentence) + ' ' }}
              />
              {sentenceToTopicsEnding.has(index) && topicSummaries && onShowTopicSummary && (
                sentenceToTopicsEnding.get(index).map((topic, tIdx) => (
                  <button
                    key={`${index}-${tIdx}`}
                    className="topic-summary-link"
                    onClick={() => onShowTopicSummary(topic, topicSummaries[topic.name])}
                    title={`View summary for topic: ${topic.name}`}
                  >
                    [📝 {topic.name}]
                  </button>
                ))
              )}
            </React.Fragment>
          ))}
        </p>
      </div>
    </div>
  );
}

export default TextDisplay;
