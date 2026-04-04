import React from "react";
import { ExtractionActivator } from "./DataExtractionTable";
import { buildExtractionKey } from "../../utils/extractionHighlight";

const TYPE_LABELS = {
  statistic: "Statistic",
  comparison: "Comparison",
  timeline_event: "Timeline",
  ranking: "Ranking",
  trend: "Trend",
  proportion: "Proportion",
  process_flow: "Process",
  overlap: "Overlap",
};

/**
 * Renders compact type badges for extractions relevant to a topic.
 * Each badge triggers the existing hover/lock highlight in sentences on interaction.
 */
export default function ExtractionBadgeBar({
  extractions,
  topicSentences,
  activeExtractionKey,
  extractionHints,
  onExtractionHoverStart,
  onExtractionHoverEnd,
  onExtractionToggle,
}) {
  if (!extractions || !topicSentences) return null;

  const filtered = extractions.filter(
    (ex) =>
      Array.isArray(ex.source_sentences) &&
      ex.source_sentences.some((idx) => topicSentences.includes(idx)),
  );

  if (filtered.length === 0) return null;

  return (
    <div className="rg-extraction-badges">
      {filtered.map((ex) => {
        const key = buildExtractionKey(ex);
        const isActive = key === activeExtractionKey;
        const typeLabel = TYPE_LABELS[ex.type] || ex.type || "Data";
        const title = extractionHints?.[key] || ex.label || typeLabel;
        return (
          <ExtractionActivator
            key={key}
            as="span"
            className={`rg-extraction-badge rg-extraction-badge--${ex.type || "data"}`}
            extractionKey={key}
            isActive={isActive}
            title={title}
            onExtractionHoverStart={onExtractionHoverStart}
            onExtractionHoverEnd={onExtractionHoverEnd}
            onExtractionToggle={onExtractionToggle}
          >
            {typeLabel}
          </ExtractionActivator>
        );
      })}
    </div>
  );
}
