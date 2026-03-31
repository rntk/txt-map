import React from 'react';

/**
 * @typedef {Object} ArticleTabHeaderProps
 * @property {string} activeTab
 * @property {(tabKey: string) => void} onTabClick
 * @property {boolean} groupedByTopics
 * @property {() => void} onToggleGrouped
 * @property {boolean} tooltipEnabled
 * @property {() => void} onToggleTooltip
 * @property {string|undefined} sourceUrl
 */
function ArticleTabHeader({
  activeTab,
  onTabClick,
  groupedByTopics,
  onToggleGrouped,
  tooltipEnabled,
  onToggleTooltip,
  sourceUrl,
}) {
  return (
    <div className="article-header-sticky">
      <div className="global-menu-links">
        <button
          className={`global-menu-link${activeTab === 'article' ? ' active' : ''}`}
          onClick={() => onTabClick('article')}
        >
          Article
        </button>
        <button
          className={`global-menu-link${activeTab === 'article_summary' ? ' active' : ''}`}
          onClick={() => onTabClick('article_summary')}
        >
          Summary
        </button>
        <button
          className={`global-menu-link${activeTab === 'raw_text' ? ' active' : ''}`}
          onClick={() => onTabClick('raw_text')}
        >
          Raw Text
        </button>
        <button
          className={`global-menu-link${activeTab === 'markup' ? ' active' : ''}`}
          onClick={() => onTabClick('markup')}
        >
          Markup
        </button>
      </div>
      {(activeTab === 'article' || activeTab === 'raw_text') && (
        <>
          <label className="grouped-topics-toggle">
            <input
              type="checkbox"
              checked={groupedByTopics}
              onChange={onToggleGrouped}
            />
            Grouped by topics
          </label>
        </>
      )}
      {(activeTab === 'article' || activeTab === 'raw_text' || activeTab === 'markup') && (
        <>
          <label className="grouped-topics-toggle" style={{ marginLeft: '12px' }}>
            <input
              type="checkbox"
              checked={tooltipEnabled}
              onChange={onToggleTooltip}
            />
            Show tooltips
          </label>
        </>
      )}
      {sourceUrl && (
        <div style={{ fontSize: '11px', color: '#666' }}>
          Source: <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{sourceUrl}</a>
        </div>
      )}
    </div>
  );
}

export default ArticleTabHeader;
