import React from 'react';
import '../styles/text-reading.css';

/**
 * @typedef {Object} ArticleTabHeaderProps
 * @property {string} activeTab
 * @property {(tabKey: string) => void} onTabClick
 * @property {boolean} groupedByTopics
 * @property {() => void} onToggleGrouped
 * @property {boolean} tooltipEnabled
 * @property {() => void} onToggleTooltip
 * @property {boolean} showMinimap
 * @property {() => void} onToggleMinimap
 * @property {string|undefined} sourceUrl
 */
function ArticleTabHeader({
  activeTab,
  onTabClick,
  groupedByTopics,
  onToggleGrouped,
  tooltipEnabled,
  onToggleTooltip,
  showMinimap,
  onToggleMinimap,
  sourceUrl,
}) {
  const supportsMinimap = activeTab === 'article' || activeTab === 'raw_text' || activeTab === 'markup';

  return (
    <div className="article-header-sticky article-tab-header">
      <div className="article-tab-header__tabs">
        <button
          type="button"
          className={`article-tab-header__tab${activeTab === 'article' ? ' article-tab-header__tab--active' : ''}`}
          onClick={() => onTabClick('article')}
        >
          Article
        </button>
        <button
          type="button"
          className={`article-tab-header__tab${activeTab === 'article_summary' ? ' article-tab-header__tab--active' : ''}`}
          onClick={() => onTabClick('article_summary')}
        >
          Summary
        </button>
        <button
          type="button"
          className={`article-tab-header__tab${activeTab === 'raw_text' ? ' article-tab-header__tab--active' : ''}`}
          onClick={() => onTabClick('raw_text')}
        >
          Raw Text
        </button>
        <button
          type="button"
          className={`article-tab-header__tab${activeTab === 'markup' ? ' article-tab-header__tab--active' : ''}`}
          onClick={() => onTabClick('markup')}
        >
          Markup
        </button>
      </div>
      {(activeTab === 'article' || activeTab === 'raw_text') && (
        <>
          <label className="grouped-topics-toggle reading-toggle article-tab-header__controls">
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
          <label className="grouped-topics-toggle reading-toggle article-tab-header__controls">
            <input
              type="checkbox"
              checked={tooltipEnabled}
              onChange={onToggleTooltip}
            />
            Show tooltips
          </label>
        </>
      )}
      {supportsMinimap && (
        <label className="grouped-topics-toggle reading-toggle article-tab-header__controls">
          <input
            type="checkbox"
            checked={showMinimap}
            onChange={onToggleMinimap}
          />
          Show minimap
        </label>
      )}
      {sourceUrl && (
        <div className="reading-source-note article-tab-header__source">
          Source: <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{sourceUrl}</a>
        </div>
      )}
    </div>
  );
}

export default ArticleTabHeader;
