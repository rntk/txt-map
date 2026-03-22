import React from 'react';
import { buildExtractionKey } from '../../utils/extractionHighlight';
import DataChart from './charts/DataChart';
import { isVisualChart } from '../../utils/dataChartUtils';

/**
 * @typedef {import('../../utils/extractionHighlight').DataExtraction} DataExtraction
 */

/**
 * @typedef {Object} DataExtractionTableProps
 * @property {DataExtraction[]} [extractions]
 * @property {string[]} [sentences]
 * @property {number[]} [topicSentences]
 * @property {string|null} [activeExtractionKey]
 * @property {Record<string, string>} [extractionHints]
 * @property {(extractionKey: string) => void} [onExtractionHoverStart]
 * @property {(extractionKey: string) => void} [onExtractionHoverEnd]
 * @property {(extractionKey: string) => void} [onExtractionToggle]
 */

function handleExtractionKeyDown(event, extractionKey, onExtractionToggle) {
  if (!onExtractionToggle) return;

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onExtractionToggle(extractionKey);
  }
}

export function ExtractionActivator({
  as = 'div',
  className,
  extractionKey,
  isActive,
  title,
  onExtractionHoverStart,
  onExtractionHoverEnd,
  onExtractionToggle,
  children,
}) {
  const Component = as;

  return (
    <Component
      className={`${className}${isActive ? ' rg-extraction__activator--active' : ''}`}
      onMouseEnter={() => onExtractionHoverStart?.(extractionKey)}
      onMouseLeave={() => onExtractionHoverEnd?.(extractionKey)}
      onFocus={() => onExtractionHoverStart?.(extractionKey)}
      onBlur={() => onExtractionHoverEnd?.(extractionKey)}
      onClick={() => onExtractionToggle?.(extractionKey)}
      onKeyDown={(event) => handleExtractionKeyDown(event, extractionKey, onExtractionToggle)}
      role="button"
      tabIndex={0}
      title={title}
    >
      {children}
    </Component>
  );
}

/**
 * Renders a single data extraction.
 * values[] are LLM-generated but grounding-checked server-side (each value
 * is verified to appear verbatim in its source sentences before storage).
 */
function ExtractionItem({
  extraction,
  sentences,
  activeExtractionKey,
  extractionHints,
  onExtractionHoverStart,
  onExtractionHoverEnd,
  onExtractionToggle,
}) {
  const { label, values, source_sentences, display_suggestion } = extraction;
  const displayMode = display_suggestion || 'inline';
  const hasValues = Array.isArray(values) && values.length > 0;
  const extractionKey = buildExtractionKey(extraction);
  const isActive = extractionKey === activeExtractionKey;
  const hintText = extractionHints?.[extractionKey] || '';

  // Visual chart rendering (bar, line, timeline, gantt)
  if (hasValues && isVisualChart(extraction)) {
    return (
      <ExtractionActivator
        className="rg-extraction rg-extraction--chart"
        extractionKey={extractionKey}
        isActive={isActive}
        title={hintText || undefined}
        onExtractionHoverStart={onExtractionHoverStart}
        onExtractionHoverEnd={onExtractionHoverEnd}
        onExtractionToggle={onExtractionToggle}
      >
        <DataChart extraction={extraction} />
      </ExtractionActivator>
    );
  }

  // Fallback: if no grounded values survived, show the raw source sentences
  if (!hasValues) {
    const sourceSentences = (source_sentences || [])
      .map((idx) => ({ idx, text: sentences && sentences[idx - 1] }))
      .filter((s) => s.text);
    if (sourceSentences.length === 0) return null;
    return (
      <ExtractionActivator
        className="rg-extraction rg-extraction--inline"
        extractionKey={extractionKey}
        isActive={isActive}
        title={hintText || undefined}
        onExtractionHoverStart={onExtractionHoverStart}
        onExtractionHoverEnd={onExtractionHoverEnd}
        onExtractionToggle={onExtractionToggle}
      >
        {label && <span className="rg-extraction__label">{label}: </span>}
        {sourceSentences.map(({ idx, text }) => (
          <span key={idx} className="rg-extraction__value">{text}</span>
        ))}
      </ExtractionActivator>
    );
  }

  if ((displayMode === 'table' || displayMode === 'chart_bar') && values.length > 1) {
    return (
      <ExtractionActivator
        className="rg-extraction rg-extraction--table"
        extractionKey={extractionKey}
        isActive={isActive}
        title={hintText || undefined}
        onExtractionHoverStart={onExtractionHoverStart}
        onExtractionHoverEnd={onExtractionHoverEnd}
        onExtractionToggle={onExtractionToggle}
      >
        {label && <div className="rg-extraction__label">{label}</div>}
        <table className="rg-extraction__table">
          <tbody>
            {values.map((v, i) => (
              <tr
                key={i}
                className={`rg-extraction__table-row${isActive ? ' rg-extraction__table-row--active' : ''}`}
              >
                {v.key && <td className="rg-extraction__table-key">{v.key}</td>}
                <td className="rg-extraction__table-val">{v.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ExtractionActivator>
    );
  }

  return (
    <ExtractionActivator
      className="rg-extraction rg-extraction--inline"
      extractionKey={extractionKey}
      isActive={isActive}
      title={hintText || undefined}
      onExtractionHoverStart={onExtractionHoverStart}
      onExtractionHoverEnd={onExtractionHoverEnd}
      onExtractionToggle={onExtractionToggle}
    >
      {label && <span className="rg-extraction__label">{label}: </span>}
      {values.map((v, i) => (
        <span key={i} className="rg-extraction__value">
          {v.key ? `${v.key}: ` : ''}{v.value}
          {i < values.length - 1 ? ' · ' : ''}
        </span>
      ))}
    </ExtractionActivator>
  );
}

/**
 * Renders all data extractions for a topic (inline) or the full data dashboard.
 * Pass topicSentences to filter to only extractions relevant to that topic.
 */
/**
 * @param {DataExtractionTableProps} props
 */
export default function DataExtractionTable({
  extractions,
  sentences,
  topicSentences,
  activeExtractionKey = null,
  extractionHints = {},
  onExtractionHoverStart,
  onExtractionHoverEnd,
  onExtractionToggle,
}) {
  if (!extractions || extractions.length === 0) return null;

  const filtered = topicSentences
    ? extractions.filter((ex) =>
        Array.isArray(ex.source_sentences) &&
        ex.source_sentences.some((idx) => topicSentences.includes(idx))
      )
    : extractions;

  if (filtered.length === 0) return null;

  return (
    <div className="rg-extractions">
      {filtered.map((ex, i) => (
        <ExtractionItem
          key={buildExtractionKey(ex) || i}
          extraction={ex}
          sentences={sentences}
          activeExtractionKey={activeExtractionKey}
          extractionHints={extractionHints}
          onExtractionHoverStart={onExtractionHoverStart}
          onExtractionHoverEnd={onExtractionHoverEnd}
          onExtractionToggle={onExtractionToggle}
        />
      ))}
    </div>
  );
}
