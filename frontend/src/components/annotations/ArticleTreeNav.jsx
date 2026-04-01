import React, { useEffect, useRef } from 'react';
import './ArticleTreeNav.css';

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
/**
 * @typedef {Object} ArticleTreeNavProps
 * @property {Array<{ name: string, sentences?: number[] }>} orderedTopics
 * @property {Record<string, { reading_priority?: string }>} topicAnnotations
 * @property {Set<string> | Iterable<string> | null | undefined} readTopics
 * @property {string | null} activeTopic
 * @property {(topicName: string) => void} onTopicClick
 * @property {number} totalSentences
 */

/**
 * @param {ArticleTreeNavProps} props
 * @returns {React.ReactElement}
 */
export default function ArticleTreeNav({
  orderedTopics,
  topicAnnotations,
  readTopics,
  activeTopic,
  onTopicClick,
  totalSentences,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current || !activeTopic) return;
    const activeEl = scrollRef.current.querySelector('.article-tree-node--active');
    if (activeEl) {
      // Find the scrollable container (.rg-tree-panel)
      const container = activeEl.closest('.rg-tree-panel');
      if (container) {
        const parentRect = container.getBoundingClientRect();
        const elRect = activeEl.getBoundingClientRect();

        // Only scroll if the active element is outside the visible area of the sidebar
        // This prevents constant "fighting" with the user's manual scroll
        const isVisible = elRect.top >= parentRect.top && elRect.bottom <= parentRect.bottom;

        if (!isVisible) {
          // Calculate the target scroll position to center the element in the sidebar
          const elOffsetTop = activeEl.offsetTop;
          const containerHeight = container.offsetHeight;
          const elHeight = activeEl.offsetHeight;

          container.scrollTo({
            top: elOffsetTop - containerHeight / 2 + elHeight / 2,
            behavior: 'smooth',
          });
        }
      }
    }
  }, [activeTopic]);

  return (
    <nav className="article-tree-nav" aria-label="Article topics">
      <div className="article-tree-nav__title">Article Flow</div>
      <div className="article-tree-nav__track">
        {/* Thin vertical connecting line */}
        <div className="article-tree-nav__line" />
        <div className="article-tree-nav__items" ref={scrollRef}>
          {orderedTopics.map((topic) => {
            const parts = topic.name.split('>').map((s) => s.trim());
            const depth = parts.length - 1;
            const displayName = parts[parts.length - 1];
            const priority = topicAnnotations[topic.name]?.reading_priority || 'recommended';
            const isRead = readTopics?.has(topic.name);
            const isActive = activeTopic === topic.name;
            const isParentActive = activeTopic && activeTopic !== topic.name && activeTopic.startsWith(topic.name + ' >');

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
                className={`article-tree-node${isActive ? ' article-tree-node--active' : ''}${isParentActive ? ' article-tree-node--parent-active' : ''}${isRead ? ' article-tree-node--read' : ''}`}
                style={{
                  '--article-tree-node-indent': `${10 + depth * 13}px`,
                  '--article-tree-node-dot-color': PRIORITY_COLORS[priority],
                }}
                onClick={() => onTopicClick(topic.name)}
                title={topic.name.replace(/\s*>\s*/g, ' › ')}
              >
                <span
                  className="article-tree-node__dot"
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
