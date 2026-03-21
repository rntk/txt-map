import React from 'react';

/**
 * Renders a single data extraction.
 * values[] are LLM-generated but grounding-checked server-side (each value
 * is verified to appear verbatim in its source sentences before storage).
 */
function ExtractionItem({ extraction, sentences }) {
  const { label, values, source_sentences, display_suggestion } = extraction;
  const displayMode = display_suggestion || 'inline';
  const hasValues = Array.isArray(values) && values.length > 0;

  // Fallback: if no grounded values survived, show the raw source sentences
  if (!hasValues) {
    const sourceSentences = (source_sentences || [])
      .map((idx) => ({ idx, text: sentences && sentences[idx - 1] }))
      .filter((s) => s.text);
    if (sourceSentences.length === 0) return null;
    return (
      <div className="rg-extraction rg-extraction--inline">
        {label && <span className="rg-extraction__label">{label}: </span>}
        {sourceSentences.map(({ idx, text }) => (
          <span key={idx} className="rg-extraction__value">{text}</span>
        ))}
      </div>
    );
  }

  if ((displayMode === 'table' || displayMode === 'chart_bar') && values.length > 1) {
    return (
      <div className="rg-extraction rg-extraction--table">
        {label && <div className="rg-extraction__label">{label}</div>}
        <table className="rg-extraction__table">
          <tbody>
            {values.map((v, i) => (
              <tr key={i}>
                {v.key && <td className="rg-extraction__table-key">{v.key}</td>}
                <td className="rg-extraction__table-val">{v.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rg-extraction rg-extraction--inline">
      {label && <span className="rg-extraction__label">{label}: </span>}
      {values.map((v, i) => (
        <span key={i} className="rg-extraction__value">
          {v.key ? `${v.key}: ` : ''}{v.value}
          {i < values.length - 1 ? ' · ' : ''}
        </span>
      ))}
    </div>
  );
}

/**
 * Renders all data extractions for a topic (inline) or the full data dashboard.
 * Pass topicSentences to filter to only extractions relevant to that topic.
 */
export default function DataExtractionTable({ extractions, sentences, topicSentences }) {
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
        <ExtractionItem key={i} extraction={ex} sentences={sentences} />
      ))}
    </div>
  );
}
