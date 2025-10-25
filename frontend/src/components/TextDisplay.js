import React from 'react';

// Minimal HTML sanitizer to render original article HTML safely without external deps.
// Removes dangerous tags and attributes while preserving common formatting.
function sanitizeHTML(html) {
  if (!html || typeof document === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = html;

  const blockedTags = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'svg',
    'form', 'input', 'button'
  ]);

  // Remove all blocked tags
  blockedTags.forEach(tag => {
    template.content.querySelectorAll(tag).forEach(el => el.remove());
  });

  const isUnsafeUrl = (val) => {
    if (!val) return false;
    const v = String(val).trim().toLowerCase();
    return v.startsWith('javascript:') || v.startsWith('data:') || v.startsWith('vbscript:');
  };

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
  let node = walker.currentNode;
  while (node) {
    // Remove event handlers and unsafe attributes
    // Allow a conservative set of attributes
    const allowedAttrs = new Set(['href', 'src', 'alt', 'title', 'class', 'id', 'rel', 'target', 'aria-label', 'role', 'width', 'height']);
    // Clone attributes first to avoid live list mutation issues
    Array.from(node.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      const val = attr.value;
      // remove inline event handlers and style
      if (name.startsWith('on') || name === 'style') {
        node.removeAttribute(attr.name);
        return;
      }
      if (!allowedAttrs.has(name)) {
        node.removeAttribute(attr.name);
        return;
      }
      if ((name === 'href' || name === 'src') && isUnsafeUrl(val)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (name === 'target' && val === '_blank') {
        // enforce rel safety
        const rel = node.getAttribute('rel') || '';
        const needed = ['noopener', 'noreferrer'];
        const current = new Set(rel.split(/\s+/).filter(Boolean));
        needed.forEach(n => current.add(n));
        node.setAttribute('rel', Array.from(current).join(' '));
      }
    });
    node = walker.nextNode();
  }

  return template.innerHTML;
}

function TextDisplay({ sentences, selectedTopics, hoveredTopic, readTopics, articleTopics, articleIndex, rawHtml, topicSummaries, onShowTopicSummary }) {
  const fadedIndices = new Set();
  readTopics.forEach(topic => {
    const relatedTopic = articleTopics.find(t => t.name === topic.name);
    if (relatedTopic) {
      relatedTopic.sentences.forEach(num => fadedIndices.add(num - 1));
    }
  });

  const highlightedIndices = new Set();
  selectedTopics.forEach(topic => {
    const relatedTopic = articleTopics.find(t => t.name === topic.name);
    if (relatedTopic) {
      relatedTopic.sentences.forEach(num => highlightedIndices.add(num - 1));
    }
  });
  if (hoveredTopic) {
    const relatedTopic = articleTopics.find(t => t.name === hoveredTopic.name);
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
  articleTopics.forEach(topic => {
    if (topic.sentences && topic.sentences.length > 0) {
      // Find the last sentence index for this topic (1-indexed, so subtract 1)
      const lastSentenceIndex = Math.max(...topic.sentences) - 1;
      if (!sentenceToTopicsEnding.has(lastSentenceIndex)) {
        sentenceToTopicsEnding.set(lastSentenceIndex, []);
      }
      sentenceToTopicsEnding.get(lastSentenceIndex).push(topic);
    }
  });

  return (
    <div className="text-display">
      <div className="text-content">
        <p className="article-text">
          {sentences.map((sentence, index) => (
            <React.Fragment key={index}>
              <span
                id={`sentence-${articleIndex}-${index}`}
                data-article-index={articleIndex}
                data-sentence-index={index}
                className={highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}
              >
                {sentence}{' '}
              </span>
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
