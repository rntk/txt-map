import React, { useEffect, useMemo, useState } from "react";
import FullScreenGraph from "./FullScreenGraph";
import BigramHeatmapSection from "./BigramHeatmapSection";

/**
 * @typedef {import("./BigramHeatmapSection").BigramHeatmapState} BigramHeatmapState
 * @typedef {import("./BigramHeatmapSection").BigramHeatmapWord} BigramHeatmapWord
 */

/**
 * @typedef {Object} TopicHeatmapViewProps
 * @property {string | null} submissionId
 * @property {() => void} [onClose]
 */

/**
 * @param {string | null} submissionId
 * @param {string} topicName
 * @returns {string | null}
 */
function buildTopicHref(submissionId, topicName) {
  if (!submissionId) {
    return null;
  }
  const params = new URLSearchParams({ topic: topicName });
  return `/page/text/${submissionId}?${params.toString()}`;
}

/**
 * @param {string | null} submissionId
 * @param {BigramHeatmapWord} rowEntry
 * @param {BigramHeatmapWord} columnEntry
 * @returns {string | null}
 */
function buildTopicWordCellHref(submissionId, rowEntry, columnEntry) {
  if (!submissionId) {
    return null;
  }
  const params = new URLSearchParams({
    words: rowEntry.word,
    topic: columnEntry.word,
  });
  return `/page/text/${submissionId}?${params.toString()}`;
}

/**
 * @param {TopicHeatmapViewProps} props
 * @returns {React.JSX.Element}
 */
function TopicHeatmapView({ submissionId, onClose }) {
  const [showAllWords, setShowAllWords] = useState(false);
  /** @type {[BigramHeatmapState, React.Dispatch<React.SetStateAction<BigramHeatmapState>>]} */
  const [heatmapState, setHeatmapState] = useState({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    setShowAllWords(false);

    if (!submissionId) {
      setHeatmapState({
        data: null,
        loading: false,
        error: "No submission ID available.",
      });
      return undefined;
    }

    const controller = new AbortController();
    setHeatmapState({ data: null, loading: true, error: null });

    fetch(`/api/submission/${submissionId}/topic-analysis/topic-word-heatmap`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        setHeatmapState({ data: json, loading: false, error: null });
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          return;
        }
        setHeatmapState({
          data: null,
          loading: false,
          error: err.message,
        });
      });

    return () => {
      controller.abort();
    };
  }, [submissionId]);

  const renderColumnHeader = useMemo(
    () =>
      /** @param {BigramHeatmapWord} entry */
      (entry) => {
        const rawParts = String(entry.word)
          .split(">")
          .map((part) => part.trim())
          .filter(Boolean);
        const parts = rawParts.length > 0 ? rawParts : [entry.word];
        const href = buildTopicHref(submissionId, entry.word);
        const title = `${entry.word} (${entry.frequency})`;
        const stack = parts.map((part, index) => (
          <span
            key={`${part}-${index}`}
            className={`topic-heatmap-column-part${index === parts.length - 1 ? " topic-heatmap-column-part--leaf" : ""}`}
          >
            {part}
          </span>
        ));
        return href ? (
          <a
            href={href}
            className="topic-heatmap-word-link topic-heatmap-column-stack"
            title={title}
          >
            {stack}
          </a>
        ) : (
          <span className="topic-heatmap-column-stack" title={title}>
            {stack}
          </span>
        );
      },
    [submissionId],
  );

  const metaPrefix = useMemo(() => {
    const data = heatmapState.data;
    if (!data) {
      return undefined;
    }
    const topicCount = Array.isArray(data.col_words)
      ? data.col_words.length
      : 0;
    return `Topics: ${topicCount} · Normalization: ${data.normalization} · Word frequency per topic`;
  }, [heatmapState.data]);

  return (
    <FullScreenGraph title="Topic Heatmap" onClose={onClose}>
      <div className="chart-surface__panel article-bigram-heatmap-view">
        <div className="chart-surface__panel-body article-bigram-heatmap-view__body">
          <BigramHeatmapSection
            submissionId={submissionId}
            heatmapState={heatmapState}
            showAllWords={showAllWords}
            onToggleWordCount={() =>
              setShowAllWords((currentValue) => !currentValue)
            }
            emptyMessage="No topic-word heatmap data available."
            fillAvailableHeight={true}
            metaPrefix={metaPrefix}
            ariaLabel="Topic-word heatmap"
            columnFilterLabel="Filter topics"
            rowFilterLabel="Filter words"
            renderColumnHeader={renderColumnHeader}
            buildCellHref={buildTopicWordCellHref}
            buildCellAriaLabel={(rowEntry, columnEntry) =>
              `Open ${rowEntry.word} highlighted within ${columnEntry.word}`
            }
            diagonalEnabled={false}
          />
        </div>
      </div>
    </FullScreenGraph>
  );
}

export default TopicHeatmapView;
