import React from 'react';

function TopicSentencePanel({ panelTopic, articles, onClose }) {
  const topicsToShow = Array.isArray(panelTopic) ? panelTopic : [panelTopic];
  const topicNames = topicsToShow.map(topic => topic.name);
  const totalSentences = topicsToShow.reduce((sum, topic) => sum + (topic.totalSentences || 0), 0);
  const displayName = Array.isArray(panelTopic)
    ? `${topicsToShow[0].name.split(/[\s_]/)[0]} (${topicsToShow.length} topics)`
    : panelTopic.name;

  const selectedArticle = articles[0];
  const relatedTopics = selectedArticle.topics.filter(topic => topicNames.includes(topic.name));
  const allSentenceIndices = new Set();
  relatedTopics.forEach(topic => {
    topic.sentences.forEach(idx => allSentenceIndices.add(idx));
  });
  const sortedIndices = Array.from(allSentenceIndices).sort((a, b) => a - b);

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
        <button onClick={onClose} className="close-panel">×</button>
      </div>
      <div className="overlay-content">
        <div className="article-section">
          <h3>Analyzed text ({relatedTopics.map(topic => topic.name).join(', ')})</h3>
          <div className="article-text">
            {sortedIndices.map((sentenceIndex, idx) => {
              const sentence = selectedArticle.sentences[sentenceIndex - 1];
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
      </div>
    </div>
  );
}

export default React.memo(TopicSentencePanel);
