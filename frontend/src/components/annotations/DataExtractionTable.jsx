import React from 'react';

/**
 * Renders a single data extraction using the actual article sentences.
 * The LLM only provides source_sentence indices — no LLM-generated values.
 */
function ExtractionItem({ extraction, sentences }) {
  const { label, source_sentences, display_suggestion } = extraction;
  const displayMode = display_suggestion || 'inline';

  const sourceSentences = (source_sentences || [])
    .map((idx) => ({ idx, text: sentences && sentences[idx - 1] }))
    .filter((s) => s.text);

  if (sourceSentences.length === 0) return null;

  if (displayMode === 'table' && sourceSentences.length > 1) {
    return (
      <div className="rg-extraction rg-extraction--table">
        {label && <div className="rg-extraction__label">{label}</div>}
        <table className="rg-extraction__table">
          <tbody>
            {sourceSentences.map(({ idx, text }) => (
              <tr key={idx}>
                <td className="rg-extraction__table-val">{text}</td>
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
      {sourceSentences.map(({ idx, text }) => (
        <span key={idx} className="rg-extraction__value">{text}</span>
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
