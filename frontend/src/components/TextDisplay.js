import React from 'react';
import { sanitizeHTML } from '../utils/sanitize';

function buildHighlightedRawHtml(rawHtml, markerWordIndices, highlightedIndices, fadedIndices, articleIndex) {
  if (!rawHtml || typeof document === 'undefined') return '';

  const safeHtml = sanitizeHTML(rawHtml);
  if (!Array.isArray(markerWordIndices) || markerWordIndices.length === 0) {
    return safeHtml;
  }

  const sentenceEndWordSet = new Set(markerWordIndices);
  const template = document.createElement('template');
  template.innerHTML = safeHtml;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node);
    node = walker.nextNode();
  }

  let wordIndex = 0;
  let sentenceIndex = 0;
  let firstWordInSentence = true;

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || '';
    if (!text.trim()) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    const wordMatches = text.matchAll(/\S+/g);

    for (const match of wordMatches) {
      const start = match.index || 0;
      const end = start + match[0].length;

      if (start > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
      }

      const wordDiv = document.createElement('div');
      wordDiv.classList.add('sentence-token');
      wordDiv.textContent = match[0];

      if (firstWordInSentence) {
        wordDiv.id = `sentence-${articleIndex}-${sentenceIndex}`;
        wordDiv.setAttribute('data-article-index', String(articleIndex));
        wordDiv.setAttribute('data-sentence-index', String(sentenceIndex));
      }

      if (highlightedIndices.has(sentenceIndex)) {
        wordDiv.classList.add('highlighted');
      } else if (fadedIndices.has(sentenceIndex)) {
        wordDiv.classList.add('faded');
      }

      fragment.appendChild(wordDiv);

      cursor = end;
      wordIndex += 1;

      if (sentenceEndWordSet.has(wordIndex - 1)) {
        sentenceIndex += 1;
        firstWordInSentence = true;
      } else {
        firstWordInSentence = false;
      }
    }

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  return template.innerHTML;
}

function TextDisplay({ sentences, selectedTopics, hoveredTopic, readTopics, articleTopics, articleIndex, rawHtml, markerWordIndices, topicSummaries, onShowTopicSummary, paragraphMap }) {
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

  const hasSentenceStateStyling = highlightedIndices.size > 0 || fadedIndices.size > 0;

  if (rawHtml && hasSentenceStateStyling && Array.isArray(markerWordIndices) && markerWordIndices.length > 0) {
    const highlightedRawHtml = buildHighlightedRawHtml(
      rawHtml,
      markerWordIndices,
      highlightedIndices,
      fadedIndices,
      articleIndex
    );

    return (
      <div className="text-display">
        <div className="text-content">
          <div className="article-html" dangerouslySetInnerHTML={{ __html: highlightedRawHtml }} />
        </div>
      </div>
    );
  }

  const shouldRenderRawHtml =
    Boolean(rawHtml) &&
    safeSelectedTopics.length === 0 &&
    !hoveredTopic &&
    readTopicsSet.size === 0;

  if (shouldRenderRawHtml) {
    const safe = sanitizeHTML(rawHtml);
    return (
      <div className="text-display">
        <div className="text-content">
          <div className="article-html" dangerouslySetInnerHTML={{ __html: safe }} />
        </div>
      </div>
    );
  }

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
