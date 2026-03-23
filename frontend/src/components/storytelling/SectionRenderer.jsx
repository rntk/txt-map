import React from 'react';
import { COMPONENT_REGISTRY, assembleChartProps } from './componentRegistry';

/**
 * @typedef {Object} StorytellingSection
 * @property {string} [type]
 * @property {string} [style]
 * @property {string} [text]
 * @property {string} [topic]
 * @property {string} [insight]
 * @property {string[]} [topics]
 * @property {Array<{label?: string, value?: string}>} [items]
 * @property {string} [component]
 * @property {string} [title]
 * @property {string} [caption]
 * @property {string[]} [findings]
 */

function NarrativeSection({ section }) {
  const style = section.style || 'body';
  return (
    <p className={`storytelling-narrative storytelling-narrative--${style}`}>
      {section.text}
    </p>
  );
}

function StatsSection({ section }) {
  const items = Array.isArray(section.items) ? section.items : [];
  return (
    <div className="storytelling-stats">
      {items.map((item, i) => (
        <div key={i} className="storytelling-stats__item">
          <span className="storytelling-stats__label">{item.label}</span>
          <span className="storytelling-stats__value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartSection({ section, dataCtx }) {
  const componentName = section.component;
  const entry = COMPONENT_REGISTRY[componentName];
  if (!entry) return null;

  const props = assembleChartProps(componentName, dataCtx, section);
  if (!props) return null;

  const ChartComponent = entry.component;

  return (
    <div className="storytelling-chart">
      {section.title && (
        <h3 className="storytelling-chart__title">{section.title}</h3>
      )}
      <div className="storytelling-chart__container">
        <ChartComponent {...props} />
      </div>
      {section.caption && (
        <p className="storytelling-chart__caption">{section.caption}</p>
      )}
    </div>
  );
}

function HighlightSection({ section }) {
  const topics = Array.isArray(section.topics)
    ? [...new Set(section.topics.filter((topicName) => typeof topicName === 'string' && topicName.trim()))]
    : [];

  return (
    <div className="storytelling-highlight">
      {topics.length > 0 ? (
        <div className="storytelling-highlight__topics">
          {topics.map((topicName) => (
            <span
              key={topicName}
              className="storytelling-highlight__topic-chip"
              title={topicName.includes('>') ? topicName : undefined}
            >
              {topicName.split('>').pop().trim()}
            </span>
          ))}
        </div>
      ) : section.topic ? (
        <span className="storytelling-highlight__topic">{section.topic}</span>
      ) : null}
      {topics.length === 0 && section.text && (
        <p className="storytelling-highlight__text">{section.text}</p>
      )}
      {topics.length === 0 && section.insight && (
        <p className="storytelling-highlight__insight">{section.insight}</p>
      )}
    </div>
  );
}

function KeyFindingsSection({ section }) {
  const findings = Array.isArray(section.findings) ? section.findings : [];
  return (
    <div className="storytelling-findings">
      <h3 className="storytelling-findings__title">Key Findings</h3>
      <ul className="storytelling-findings__list">
        {findings.map((f, i) => (
          <li key={i} className="storytelling-findings__item">{f}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Renders a single section from the LLM-generated storytelling layout.
 * Unknown section types are silently skipped.
 *
 * @param {{ section?: StorytellingSection, dataCtx?: Object }} props
 */
function SectionRenderer({ section, dataCtx }) {
  if (!section || !section.type) return null;

  switch (section.type) {
    case 'narrative':
      return <NarrativeSection section={section} />;
    case 'stats':
      return <StatsSection section={section} />;
    case 'chart':
      return <ChartSection section={section} dataCtx={dataCtx} />;
    case 'highlight':
      return <HighlightSection section={section} />;
    case 'key_findings':
      return <KeyFindingsSection section={section} />;
    default:
      return null;
  }
}

export default SectionRenderer;
