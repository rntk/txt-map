import React from 'react';
import { COMPONENT_REGISTRY, assembleChartProps } from './componentRegistry';

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

  const props = assembleChartProps(componentName, dataCtx);
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
  return (
    <div className="storytelling-highlight">
      {section.topic && (
        <span className="storytelling-highlight__topic">{section.topic}</span>
      )}
      <p className="storytelling-highlight__text">{section.text}</p>
      {section.insight && (
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
