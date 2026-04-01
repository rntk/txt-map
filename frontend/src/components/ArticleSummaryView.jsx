import React, { useState, useMemo, useCallback } from 'react';
import SummarySourceMenu from './SummarySourceMenu';
import '../styles/text-reading.css';

/**
 * @typedef {Object} ArticleSummaryViewProps
 * @property {string} articleSummaryText
 * @property {string[]} articleSummaryBullets
 * @property {Array<Array<{ topic: Object, score: number, sentenceIndices: number[] }>>} articleBulletMatches
 * @property {Array<{ topic: Object, score: number, sentenceIndices: number[] }>} articleTextMatches
 * @property {Array<{ name: string }>} selectedTopics
 * @property {(topic: Object) => void} onToggleTopic
 * @property {(modalTopic: Object) => void} onShowTopicSentences
 */
function ArticleSummaryView({
  articleSummaryText,
  articleSummaryBullets,
  articleBulletMatches,
  articleTextMatches,
  selectedTopics,
  onToggleTopic,
  onShowTopicSentences,
}) {
  const [bulletSourceMenu, setBulletSourceMenu] = useState(null);

  const highlightedBulletIndices = useMemo(() => {
    if (!selectedTopics.length || !articleBulletMatches.length) return new Set();
    const selectedNames = new Set(selectedTopics.map(t => t.name));
    const result = new Set();
    articleBulletMatches.forEach((matches, idx) => {
      if (matches.some(m => selectedNames.has(m.topic.name))) result.add(idx);
    });
    return result;
  }, [selectedTopics, articleBulletMatches]);

  const handleBulletSourceClick = useCallback((e, index) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setBulletSourceMenu({ bulletIndex: index, x: rect.left, y: rect.bottom + 4 });
  }, []);

  const handleTextSourceClick = useCallback((e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setBulletSourceMenu({ bulletIndex: -1, x: rect.left, y: rect.bottom + 4 });
  }, []);

  const handleBulletTopicSelect = useCallback((topic, sentenceIndices) => {
    setBulletSourceMenu(null);
    onShowTopicSentences({
      name: topic.name,
      displayName: topic.name,
      fullPath: topic.name,
      sentenceIndices,
      ranges: Array.isArray(topic.ranges) ? topic.ranges : [],
    });
  }, [onShowTopicSentences]);

  return (
    <>
      <div className="summary-content reading-summary">
        {articleSummaryText || articleSummaryBullets.length > 0 ? (
          <>
            {articleSummaryText && (
              <div className="summary-text reading-summary__text">
                <p>
                  {articleSummaryText}
                  {articleTextMatches.length > 0 && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="summary-source-link"
                        onClick={handleTextSourceClick}
                      >
                        [source]
                      </button>
                    </>
                  )}
                </p>
              </div>
            )}
            {articleSummaryBullets.length > 0 && (
              <div className="summary-text reading-summary__text">
                <ul className="reading-summary__list">
                  {articleSummaryBullets.map((bullet, index) => {
                    const isHighlighted = highlightedBulletIndices.has(index);
                    const topicBadges = articleBulletMatches[index] || [];
                    return (
                      <li
                        key={`${index}-${bullet}`}
                        className={`reading-summary__bullet${isHighlighted ? ' reading-summary__bullet--highlighted' : ''}`}
                      >
                        {bullet}
                        {topicBadges.slice(0, 3).map(({ topic }) => (
                          <button
                            key={topic.name}
                            type="button"
                            className="summary-topic-badge"
                            onClick={() => onToggleTopic(topic)}
                            title={`Select topic: ${topic.name}`}
                          >
                            {topic.name.split('/').pop()}
                          </button>
                        ))}
                        {articleBulletMatches[index]?.length > 0 && (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="summary-source-link"
                              onClick={(e) => handleBulletSourceClick(e, index)}
                            >
                              [source]
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p>No summary available. Processing may still be in progress...</p>
        )}
      </div>

      {bulletSourceMenu && (
        <SummarySourceMenu
          matches={
            bulletSourceMenu.bulletIndex === -1
              ? articleTextMatches
              : (articleBulletMatches[bulletSourceMenu.bulletIndex] || [])
          }
          onSelect={handleBulletTopicSelect}
          onClose={() => setBulletSourceMenu(null)}
          x={bulletSourceMenu.x}
          y={bulletSourceMenu.y}
        />
      )}
    </>
  );
}

export default ArticleSummaryView;
