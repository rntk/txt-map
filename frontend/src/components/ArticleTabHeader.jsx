import React from "react";
import ReadProgress from "./ReadProgress";
import "../styles/text-reading.css";

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
 * @property {boolean} showTopicsMeta
 * @property {() => void} onToggleTopicsMeta
 * @property {boolean} showTemperature
 * @property {() => void} onToggleTemperature
 * @property {boolean} [temperatureAvailable]
 * @property {string|undefined} sourceUrl
 * @property {number} [readPercentage]
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
  showTopicsMeta,
  onToggleTopicsMeta,
  showTemperature,
  onToggleTemperature,
  temperatureAvailable = false,
  sourceUrl,
  readPercentage = 0,
}) {
  const supportsMinimap =
    activeTab === "article" ||
    activeTab === "raw_text" ||
    activeTab === "markup";

  return (
    <div className="article-header-sticky article-tab-header">
      <div className="article-tab-header__tabs">
        <button
          type="button"
          className={`article-tab-header__tab${activeTab === "article" ? " article-tab-header__tab--active" : ""}`}
          onClick={() => onTabClick("article")}
        >
          Article
        </button>
        <button
          type="button"
          className={`article-tab-header__tab${activeTab === "article_summary" ? " article-tab-header__tab--active" : ""}`}
          onClick={() => onTabClick("article_summary")}
        >
          Summary
        </button>
        <button
          type="button"
          className={`article-tab-header__tab${activeTab === "raw_text" ? " article-tab-header__tab--active" : ""}`}
          onClick={() => onTabClick("raw_text")}
        >
          Raw Text
        </button>
        <button
          type="button"
          className={`article-tab-header__tab${activeTab === "markup" ? " article-tab-header__tab--active" : ""}`}
          onClick={() => onTabClick("markup")}
        >
          Markup
        </button>
      </div>
      {(activeTab === "article" || activeTab === "raw_text") && (
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
      {(activeTab === "article" ||
        activeTab === "raw_text" ||
        activeTab === "markup") && (
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
      {supportsMinimap && (
        <label className="grouped-topics-toggle reading-toggle article-tab-header__controls">
          <input
            type="checkbox"
            checked={showTopicsMeta}
            onChange={onToggleTopicsMeta}
          />
          Show topics meta
        </label>
      )}
      {supportsMinimap && temperatureAvailable && (
        <label className="grouped-topics-toggle reading-toggle article-tab-header__controls article-tab-header__temperature">
          <input
            type="checkbox"
            checked={showTemperature}
            onChange={onToggleTemperature}
          />
          Temperature
          <span
            className="article-tab-header__temperature-legend"
            aria-hidden="true"
          />
        </label>
      )}

      <div className="article-tab-header__progress">
        <ReadProgress percentage={readPercentage} size={45} label="" />
      </div>

      {sourceUrl && (
        <div className="reading-source-note article-tab-header__source">
          Source:{" "}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            {sourceUrl}
          </a>
        </div>
      )}
    </div>
  );
}

export default ArticleTabHeader;
