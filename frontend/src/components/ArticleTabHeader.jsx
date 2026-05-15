import React from "react";
import ReadProgress from "./ReadProgress";
import "../styles/text-reading.css";

const ARTICLE_TABS = [
  { key: "article", label: "Article" },
  { key: "article_summary", label: "Summary" },
  { key: "raw_text", label: "Raw Text" },
  { key: "markup", label: "Markup" },
];

function renderToggleControl({
  key,
  visible,
  checked,
  onChange,
  label,
  className = "grouped-topics-toggle reading-toggle article-tab-header__controls",
  extraContent = null,
}) {
  if (!visible) {
    return null;
  }

  return (
    <label key={key} className={className}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
      {extraContent}
    </label>
  );
}

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
  const supportsGroupedTopics =
    activeTab === "article" || activeTab === "raw_text";
  const controls = [
    {
      key: "grouped",
      visible: supportsGroupedTopics,
      checked: groupedByTopics,
      onChange: onToggleGrouped,
      label: "Grouped by topics",
    },
    {
      key: "tooltip",
      visible: supportsMinimap,
      checked: tooltipEnabled,
      onChange: onToggleTooltip,
      label: "Show tooltips",
    },
    {
      key: "minimap",
      visible: supportsMinimap,
      checked: showMinimap,
      onChange: onToggleMinimap,
      label: "Show minimap",
    },
    {
      key: "topics-meta",
      visible: supportsMinimap,
      checked: showTopicsMeta,
      onChange: onToggleTopicsMeta,
      label: "Show topics meta",
    },
    {
      key: "temperature",
      visible: supportsMinimap && temperatureAvailable,
      checked: showTemperature,
      onChange: onToggleTemperature,
      label: "Temperature",
      className:
        "grouped-topics-toggle reading-toggle article-tab-header__controls article-tab-header__temperature",
      extraContent: (
        <span
          className="article-tab-header__temperature-legend"
          aria-hidden="true"
        />
      ),
    },
  ];

  return (
    <div className="article-header-sticky article-tab-header">
      <div className="article-tab-header__tabs">
        {ARTICLE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`article-tab-header__tab${activeTab === tab.key ? " article-tab-header__tab--active" : ""}`}
            onClick={() => onTabClick(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {controls.map((control) => renderToggleControl(control))}

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
