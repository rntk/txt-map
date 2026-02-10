import React from 'react';

function OverlayPanel({ showPanel, panelTopic, articles, toggleShowPanel, scrollToArticle }) {
  if (!showPanel || !panelTopic) return null;

  // Handle both single topic and array of topics
  const topics = Array.isArray(panelTopic) ? panelTopic : [panelTopic];
  const topicNames = topics.map(t => t.name);
  const totalSentences = topics.reduce((sum, t) => sum + t.totalSentences, 0);
  const displayName = Array.isArray(panelTopic)
    ? `${topics[0].name.split(/[\s_]/)[0]} (${topics.length} topics)`
    : panelTopic.name;

  return (
    <div className="overlay-panel">
      <div className="overlay-header">
        <div className="overlay-title-section">
          <h2>Sentences for {displayName}: {totalSentences} sentences</h2>
          {!Array.isArray(panelTopic) && panelTopic.summary && (
            <div className="overlay-summary-note">
              <span className="summary-icon">📝</span> {panelTopic.summary}
            </div>
          )}
        </div>
        <button onClick={() => toggleShowPanel(panelTopic)} className="close-panel">×</button>
      </div>
      <div className="overlay-content">
        {articles.map((article, index) => {
          // Find all related topics in this article
          const relatedTopics = article.topics.filter(t => topicNames.includes(t.name));
          if (relatedTopics.length === 0) return null;

          // Collect all sentence indices from all related topics
          const allSentenceIndices = new Set();
          relatedTopics.forEach(topic => {
            topic.sentences.forEach(idx => allSentenceIndices.add(idx));
          });

          // Sort sentence indices to maintain original order
          const sortedIndices = Array.from(allSentenceIndices).sort((a, b) => a - b);

          return (
            <div key={index} className="article-section">
              <h3
                className="article-link"
                onClick={() => scrollToArticle(index)}
              >
                Article {index + 1} ({relatedTopics.map(t => t.name).join(', ')})
              </h3>
              <div className="article-text">
                {sortedIndices.map((sentenceIndex, idx) => {
                  const sentence = article.sentences[sentenceIndex - 1];
                  const isGap = idx > 0 && sortedIndices[idx] !== sortedIndices[idx - 1] + 1;

                  return (
                    <React.Fragment key={sentenceIndex}>
                      {isGap && <div className="sentence-gap">...</div>}
                      <span className="sentence-block">{sentence} </span>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OverlayPanel;