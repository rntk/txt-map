import React, { useMemo, useState } from 'react';
import ExtractionBadgeBar from './ExtractionBadgeBar';
import {
  buildExtractionTextSegments,
  extractionIncludesSentence,
} from '../../utils/extractionHighlight';

/**
 * @typedef {import('../../utils/extractionHighlight').DataExtraction} DataExtraction
 */

/**
 * @typedef {Object} TopicCardProps
 * @property {{ name?: string, sentences?: number[] }} topic
 * @property {Object} [topicAnnotation]
 * @property {Object} [sentenceAnnotations]
 * @property {string[]} [sentences]
 * @property {DataExtraction[]} [dataExtractions]
 * @property {boolean} [isRead]
 * @property {(topic: Object) => void} [onToggleRead]
 * @property {(element: HTMLDivElement|null) => void} [cardRef]
 * @property {DataExtraction|null} [activeExtraction]
 * @property {DataExtraction|null} [lockedExtraction]
 * @property {string|null} [activeExtractionKey]
 * @property {Record<string, string>} [extractionHints]
 * @property {(extractionKey: string) => void} [onExtractionHoverStart]
 * @property {(extractionKey: string) => void} [onExtractionHoverEnd]
 * @property {(extractionKey: string) => void} [onExtractionToggle]
 */

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

function KeySentence({ text, annotation, isActive, isSourceReveal, activeExtraction }) {
  const importance = annotation?.importance || 'normal';
  const flags = annotation?.flags || [];
  const segments = useMemo(
    () => (isActive ? buildExtractionTextSegments(text, activeExtraction) : [{ text, highlighted: false }]),
    [text, isActive, activeExtraction]
  );

  return (
    <div
      className={`rg-sentence rg-sentence--${importance}${isActive ? ' rg-sentence--active' : ''}${isSourceReveal ? ' rg-sentence--source-reveal' : ''}`}
    >
      <span className="rg-sentence__text">
        {segments.map((segment, index) => (
          <span
            key={`${segment.text}-${index}`}
            className={segment.highlighted ? 'rg-sentence__text-highlight' : undefined}
          >
            {segment.text}
          </span>
        ))}
      </span>
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
/**
 * @param {TopicCardProps} props
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
  activeExtraction = null,
  lockedExtraction = null,
  activeExtractionKey = null,
  extractionHints = {},
  onExtractionHoverStart,
  onExtractionHoverEnd,
  onExtractionToggle,
  showPath = true,
}) {
  const name = topic?.name || '';
  const topicSentences = useMemo(
    () => (Array.isArray(topic?.sentences) ? topic.sentences : []),
    [topic?.sentences]
  );
  const ann = topicAnnotation || {};
  const priority = ann.reading_priority || 'recommended';
  const skipReason = ann.skip_reason;
  const recommendedSentences = ann.recommended_sentences || [];

  // optional and skip topics start folded; read topics also start folded
  const startFolded = priority === 'optional' || priority === 'skip' || isRead;
  const [folded, setFolded] = useState(startFolded);

  const displayName = name.includes('>') ? name.split('>').pop() : name;
  const fullPath = name.includes('>') ? name.split('>').slice(0, -1).join(' › ') : null;
  const lockedSourceSentenceIndices = useMemo(() => {
    if (!lockedExtraction || !Array.isArray(lockedExtraction.source_sentences)) {
      return [];
    }

    return lockedExtraction.source_sentences.filter((idx) => topicSentences.includes(idx));
  }, [lockedExtraction, topicSentences]);
  const isOpen = !folded || lockedSourceSentenceIndices.length > 0;

  // Key sentences: LLM-recommended (high importance), capped at 5
  const highImportanceIndices = topicSentences
    .filter((idx) => sentenceAnnotations?.[String(idx)]?.importance === 'high')
    .slice(0, 5);

  const keySentenceIndices = recommendedSentences.length > 0
    ? recommendedSentences.slice(0, 5)
    : highImportanceIndices.length > 0
        ? highImportanceIndices
        : topicSentences.slice(0, 3);
  const visibleSentenceIndices = useMemo(() => {
    const merged = new Set([...keySentenceIndices, ...lockedSourceSentenceIndices]);
    return [...merged].sort((a, b) => a - b);
  }, [keySentenceIndices, lockedSourceSentenceIndices]);

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
          {showPath && fullPath && <span className="rg-topic-card__path">{fullPath} ›</span>}
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
            {isOpen ? '▾' : '▸'}
          </button>
        </div>
      </div>

      {folded && skipReason && (
        <div className="rg-topic-card__skip-reason-collapsed">
          {SKIP_REASON_LABELS[skipReason] || skipReason}
        </div>
      )}

      {isOpen && (
        <div className="rg-topic-card__body">
          <div className="rg-topic-card__content">
            <ExtractionBadgeBar
              extractions={dataExtractions}
              topicSentences={topicSentences}
              activeExtractionKey={activeExtractionKey}
              extractionHints={extractionHints}
              onExtractionHoverStart={onExtractionHoverStart}
              onExtractionHoverEnd={onExtractionHoverEnd}
              onExtractionToggle={onExtractionToggle}
            />
            {visibleSentenceIndices.length > 0 && (
              <div className="rg-topic-card__sentences">
                {visibleSentenceIndices.map((idx) => {
                  const text = sentences && sentences[idx - 1];
                  if (!text) return null;
                  const annotation = sentenceAnnotations?.[String(idx)];
                  const isActiveSourceSentence = extractionIncludesSentence(activeExtraction, idx);
                  const isSourceReveal = isActiveSourceSentence && !keySentenceIndices.includes(idx);
                  return (
                    <KeySentence
                      key={idx}
                      text={text}
                      annotation={annotation}
                      isActive={isActiveSourceSentence}
                      isSourceReveal={isSourceReveal}
                      activeExtraction={activeExtraction}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

