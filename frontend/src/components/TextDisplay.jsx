import React from 'react';
import { sanitizeHTML } from '../utils/sanitize';

function normalizeWithMap(value) {
  const source = String(value || '');
  let normalized = '';
  const normalizedToOriginal = [];
  let previousWasWhitespace = true;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const isWhitespace = /\s/.test(char);

    if (isWhitespace) {
      if (!previousWasWhitespace) {
        normalized += ' ';
        normalizedToOriginal.push(i);
        previousWasWhitespace = true;
      }
      continue;
    }

    normalized += char;
    normalizedToOriginal.push(i);
    previousWasWhitespace = false;
  }

  if (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1);
    normalizedToOriginal.pop();
  }

  return { normalized, normalizedToOriginal };
}

function mapSentenceRanges(fullText, sentences) {
  const full = normalizeWithMap(fullText);
  const ranges = [];
  let searchFrom = 0;

  sentences.forEach((sentence, sentenceIndex) => {
    const normalizedSentence = normalizeWithMap(sentence).normalized;
    if (!normalizedSentence) {
      return;
    }

    const matchIndex = full.normalized.indexOf(normalizedSentence, searchFrom);
    if (matchIndex < 0) {
      return;
    }

    const start = full.normalizedToOriginal[matchIndex];
    const endNorm = matchIndex + normalizedSentence.length - 1;
    const end = full.normalizedToOriginal[endNorm] + 1;

    ranges.push({
      sentenceIndex,
      start,
      end
    });

    searchFrom = matchIndex + normalizedSentence.length;
  });

  return ranges;
}

function buildHighlightedRawHtml(rawHtml, safeSentences, articleIndex, highlightedIndices, fadedIndices) {
  if (!rawHtml || typeof document === 'undefined') {
    return '';
  }

  const sanitizedHtml = sanitizeHTML(rawHtml);
  const template = document.createElement('template');
  template.innerHTML = sanitizedHtml;

  const fullText = template.content.textContent || '';
  const ranges = mapSentenceRanges(fullText, safeSentences);
  if (ranges.length === 0) {
    return sanitizedHtml;
  }

  const textNodes = [];
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT, null);
  let textNode = walker.nextNode();
  let cursor = 0;

  while (textNode) {
    const text = textNode.nodeValue || '';
    if (text.length > 0) {
      textNodes.push({ node: textNode, start: cursor, end: cursor + text.length });
      cursor += text.length;
    }
    textNode = walker.nextNode();
  }

  textNodes.forEach(({ node, start, end }) => {
    const nodeRanges = ranges.filter(range => range.start < end && range.end > start);
    if (nodeRanges.length === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();
    const nodeText = node.nodeValue || '';
    let localCursor = 0;

    nodeRanges.forEach((range) => {
      const localStart = Math.max(0, range.start - start);
      const localEnd = Math.min(nodeText.length, range.end - start);

      if (localStart > localCursor) {
        fragment.appendChild(document.createTextNode(nodeText.slice(localCursor, localStart)));
      }

      if (localEnd > localStart) {
        const span = document.createElement('span');
        const classes = ['sentence-token'];
        if (highlightedIndices.has(range.sentenceIndex)) {
          classes.push('highlighted');
        } else if (fadedIndices.has(range.sentenceIndex)) {
          classes.push('faded');
        }
        span.className = classes.join(' ');
        span.dataset.articleIndex = String(articleIndex);
        span.dataset.sentenceIndex = String(range.sentenceIndex);
        span.textContent = nodeText.slice(localStart, localEnd);
        fragment.appendChild(span);
      }

      localCursor = localEnd;
    });

    if (localCursor < nodeText.length) {
      fragment.appendChild(document.createTextNode(nodeText.slice(localCursor)));
    }

    node.parentNode.replaceChild(fragment, node);
  });

  return template.innerHTML;
}

function TextDisplay({ sentences, selectedTopics, hoveredTopic, readTopics, articleTopics, articleIndex, paragraphMap, topicSummaries, onShowTopicSummary, rawHtml }) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  const safeSelectedTopics = Array.isArray(selectedTopics) ? selectedTopics : [];
  const safeArticleTopics = Array.isArray(articleTopics) ? articleTopics : [];
  const readTopicsSet = readTopics instanceof Set ? readTopics : new Set(readTopics || []);
  const safeParagraphMap = paragraphMap && typeof paragraphMap === 'object' ? paragraphMap : null;

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
    safeSentences,
    articleIndex,
    highlightedIndices,
    fadedIndices
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
