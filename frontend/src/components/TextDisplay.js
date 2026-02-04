import React from 'react';
import { sanitizeHTML } from '../utils/sanitize';

function TextDisplay({ sentences, htmlSentences, selectedTopics, hoveredTopic, readTopics, articleTopics, articleIndex, rawHtml, topicSummaries, onShowTopicSummary, paragraphMap }) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  const safeHtmlSentences = Array.isArray(htmlSentences) && htmlSentences.length === safeSentences.length ? htmlSentences : null;
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

  // If original HTML is provided, render it (sanitized) to preserve formatting
  if (rawHtml) {
    const safe = sanitizeHTML(rawHtml);
    return (
      <div className="text-display">
        <div className="text-content">
          {/* Rendering sanitized original HTML for better readability */}
          <div className="article-html" dangerouslySetInnerHTML={{ __html: safe }} />
        </div>
      </div>
    );
  }

  // Build a map of sentence index to topics that end at that sentence
  const sentenceToTopicsEnding = new Map();
  safeArticleTopics.forEach(topic => {
    if (topic.sentences && topic.sentences.length > 0) {
      // Find the last sentence index for this topic (1-indexed, so subtract 1)
      const lastSentenceIndex = Math.max(...topic.sentences) - 1;
      if (!sentenceToTopicsEnding.has(lastSentenceIndex)) {
        sentenceToTopicsEnding.set(lastSentenceIndex, []);
      }
      sentenceToTopicsEnding.get(lastSentenceIndex).push(topic);
    }
  });

  // Group sentences by paragraph if paragraph_map is provided
  if (safeParagraphMap && Object.keys(safeParagraphMap).length > 0) {
    // Build a map of paragraph index -> array of {text, index}
    const paragraphGroups = new Map();
    
    safeSentences.forEach((sentence, idx) => {
      const sentenceParagraphIdx = safeParagraphMap[idx] !== undefined ? safeParagraphMap[idx] : 0;
      
      if (!paragraphGroups.has(sentenceParagraphIdx)) {
        paragraphGroups.set(sentenceParagraphIdx, []);
      }
      
      paragraphGroups.get(sentenceParagraphIdx).push({ text: sentence, index: idx });
    });
    
    // Sort paragraph indices and build ordered array
    const sortedParagraphIndices = Array.from(paragraphGroups.keys()).sort((a, b) => a - b);
    const paragraphs = sortedParagraphIndices.map(paraIdx => paragraphGroups.get(paraIdx));
    
    return (
      <div className="text-display">
        <div className="text-content">
          {paragraphs.map((para, paraIdx) => (
            <p key={paraIdx} className="article-paragraph">
              {para.map(({ text, index }) => {
                const htmlText = safeHtmlSentences ? safeHtmlSentences[index] : null;
                return (
                  <React.Fragment key={index}>
                    {htmlText ? (
                      <span
                        id={`sentence-${articleIndex}-${index}`}
                        data-article-index={articleIndex}
                        data-sentence-index={index}
                        className={highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}
                        dangerouslySetInnerHTML={{ __html: sanitizeHTML(htmlText) + ' ' }}
                      />
                    ) : (
                      <span
                        id={`sentence-${articleIndex}-${index}`}
                        data-article-index={articleIndex}
                        data-sentence-index={index}
                        className={highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}
                      >
                        {text}{' '}
                      </span>
                    )}
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
                );
              })}
            </p>
          ))}
        </div>
      </div>
    );
  }

  // Fallback: render as single paragraph if no paragraph_map provided
  return (
    <div className="text-display">
      <div className="text-content">
        <p className="article-text">
          {safeSentences.map((sentence, index) => {
            const htmlText = safeHtmlSentences ? safeHtmlSentences[index] : null;
            return (
              <React.Fragment key={index}>
                {htmlText ? (
                  <span
                    id={`sentence-${articleIndex}-${index}`}
                    data-article-index={articleIndex}
                    data-sentence-index={index}
                    className={highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}
                    dangerouslySetInnerHTML={{ __html: sanitizeHTML(htmlText) + ' ' }}
                  />
                ) : (
                  <span
                    id={`sentence-${articleIndex}-${index}`}
                    data-article-index={articleIndex}
                    data-sentence-index={index}
                    className={highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}
                  >
                    {sentence}{' '}
                  </span>
                )}
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
            );
          })}
        </p>
      </div>
    </div>
  );
}

export default TextDisplay;
