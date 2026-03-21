import React, { useState } from 'react';
import DataExtractionTable from './DataExtractionTable';

const PRIORITY_LABELS = {
  must_read: 'Must Read',
  recommended: 'Recommended',
  optional: 'Optional',
  skip: 'Low priority',
};

const SKIP_REASON_LABELS = {
  repetitive: 'Covers similar ground as other topics',
  tangential: 'Tangential to the main story',
  too_brief: 'Too brief to be meaningful',
};

const FLAG_LABELS = {
  quote: 'Quote',
  data_point: 'Data',
  unique_insight: 'Insight',
  opinion: 'Opinion',
  definition: 'Definition',
};

function SentenceBadges({ flags }) {
  if (!flags || flags.length === 0) return null;
  return (
    <span className="rg-sentence__badges">
      {flags.map((f) => (
        <span key={f} className={`rg-sentence__badge rg-sentence__badge--${f}`}>
          {FLAG_LABELS[f] || f}
        </span>
      ))}
    </span>
  );
}

function KeySentence({ text, annotation }) {
  const importance = annotation?.importance || 'normal';
  const flags = annotation?.flags || [];
  return (
    <div className={`rg-sentence rg-sentence--${importance}`}>
      <span className="rg-sentence__text">{text}</span>
      <SentenceBadges flags={flags} />
    </div>
  );
}

/**
 * Renders one annotated topic card with priority badge, quoted key sentences,
 * inline data extractions, and a Read/Unread toggle button.
 *
 * Topics are always rendered (never hidden) — optional/skip start folded
 * so users can always expand and read any content.
 */
export default function TopicCard({
  topic,
  topicAnnotation,
  sentenceAnnotations,
  sentences,
  dataExtractions,
  isRead,
  onToggleRead,
  cardRef,
}) {
  const name = topic?.name || '';
  const topicSentences = topic?.sentences || [];
  const ann = topicAnnotation || {};
  const priority = ann.reading_priority || 'recommended';
  const skipReason = ann.skip_reason;
  const recommendedSentences = ann.recommended_sentences || [];

  // optional and skip topics start folded; read topics also start folded
  const startFolded = priority === 'optional' || priority === 'skip' || isRead;
  const [folded, setFolded] = useState(startFolded);

  const displayName = name.includes('>') ? name.split('>').pop() : name;
  const fullPath = name.includes('>') ? name.split('>').slice(0, -1).join(' › ') : null;

  // Key sentences: LLM-recommended (high importance), capped at 5
  const keySentenceIndices = recommendedSentences.length > 0
    ? recommendedSentences.slice(0, 5)
    : topicSentences
        .filter((idx) => sentenceAnnotations?.[String(idx)]?.importance === 'high')
        .slice(0, 5);

  const handleReadToggle = (e) => {
    e.stopPropagation();
    onToggleRead?.(topic);
  };

  return (
    <div
      className={`rg-topic-card rg-topic-card--${priority}${isRead ? ' rg-topic-card--read' : ''}`}
      ref={cardRef}
      id={`topic-card-${encodeURIComponent(name)}`}
    >
      <div className="rg-topic-card__header" onClick={() => setFolded((f) => !f)}>
        <div className="rg-topic-card__title-row">
          {fullPath && <span className="rg-topic-card__path">{fullPath} ›</span>}
          <span className="rg-topic-card__name">{displayName}</span>
          <span className={`rg-topic-card__badge rg-topic-card__badge--${priority}`}>
            {PRIORITY_LABELS[priority] || priority}
          </span>
          {isRead && <span className="rg-topic-card__read-badge">Read</span>}
        </div>
        {skipReason && !folded === false && (
          <div className="rg-topic-card__skip-reason">
            {SKIP_REASON_LABELS[skipReason] || skipReason}
          </div>
        )}
        <div className="rg-topic-card__header-actions">
          {onToggleRead && (
            <button
              className={`rg-read-btn${isRead ? ' rg-read-btn--read' : ''}`}
              onClick={handleReadToggle}
              title={isRead ? 'Mark as unread' : 'Mark as read (will be faded in full view)'}
            >
              {isRead ? 'Unread' : 'Mark read'}
            </button>
          )}
          <button className="rg-topic-card__fold-btn" aria-label={folded ? 'Expand' : 'Collapse'}>
            {folded ? '▸' : '▾'}
          </button>
        </div>
      </div>

      {folded && skipReason && (
        <div className="rg-topic-card__skip-reason-collapsed">
          {SKIP_REASON_LABELS[skipReason] || skipReason}
        </div>
      )}

      {!folded && (
        <div className="rg-topic-card__body">
          {keySentenceIndices.length > 0 && (
            <div className="rg-topic-card__sentences">
              {keySentenceIndices.map((idx) => {
                const text = sentences && sentences[idx - 1];
                if (!text) return null;
                const annotation = sentenceAnnotations?.[String(idx)];
                return <KeySentence key={idx} text={text} annotation={annotation} />;
              })}
            </div>
          )}

          <DataExtractionTable
            extractions={dataExtractions}
            sentences={sentences}
            topicSentences={topicSentences}
          />
        </div>
      )}
    </div>
  );
}
