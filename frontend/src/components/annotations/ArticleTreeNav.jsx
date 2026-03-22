import React from 'react';

const PRIORITY_COLORS = {
  must_read: '#1a73e8',
  recommended: '#4a90d9',
  optional: '#bbb',
  skip: '#ddd',
};

/**
 * Sticky left-panel navigation tree showing all topics in article order.
 * Topics are indented by hierarchy depth (parsed from "Parent > Child" names).
 * The active topic (currently visible card) is highlighted.
 */
export default function ArticleTreeNav({
  orderedTopics,
  topicAnnotations,
  readTopics,
  activeTopic,
  onTopicClick,
  totalSentences,
}) {
  return (
    <nav className="article-tree-nav" aria-label="Article topics">
      <div className="article-tree-nav__title">Article Flow</div>
      <div className="article-tree-nav__track">
        {/* Thin vertical connecting line */}
        <div className="article-tree-nav__line" />
        <div className="article-tree-nav__items">
          {orderedTopics.map((topic) => {
            const parts = topic.name.split('>').map((s) => s.trim());
            const depth = parts.length - 1;
            const displayName = parts[parts.length - 1];
            const priority = topicAnnotations[topic.name]?.reading_priority || 'recommended';
            const isRead = readTopics?.has(topic.name);
            const isActive = activeTopic === topic.name;

            // Proportional position in the article (0–100)
            const minSentence =
              Array.isArray(topic.sentences) && topic.sentences.length
                ? Math.min(...topic.sentences)
                : 0;
            const posPercent =
              totalSentences > 0 ? Math.round((minSentence / totalSentences) * 100) : null;

            return (
              <button
                key={topic.name}
                type="button"
                className={`article-tree-node${isActive ? ' article-tree-node--active' : ''}${isRead ? ' article-tree-node--read' : ''}`}
                style={{ paddingLeft: `${10 + depth * 13}px` }}
                onClick={() => onTopicClick(topic.name)}
                title={topic.name.replace(/\s*>\s*/g, ' › ')}
              >
                <span
                  className="article-tree-node__dot"
                  style={{ background: PRIORITY_COLORS[priority] }}
                />
                <span className="article-tree-node__label">{displayName}</span>
                {posPercent !== null && depth === 0 && (
                  <span className="article-tree-node__pos">{posPercent}%</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
