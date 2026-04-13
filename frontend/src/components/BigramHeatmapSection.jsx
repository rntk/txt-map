import React from "react";
import "./TopicHeatmap.css";

/**
 * @typedef {Object} BigramHeatmapWord
 * @property {string} word
 * @property {number} frequency
 * @property {number} specificity_score
 * @property {number} outside_topic_frequency
 */

/**
 * @typedef {Object} BigramHeatmapData
 * @property {string} submission_id
 * @property {"article" | "topic"} scope
 * @property {string | null | undefined} [topic_name]
 * @property {number} window_size
 * @property {string} normalization
 * @property {BigramHeatmapWord[]} words
 * @property {BigramHeatmapWord[]} col_words
 * @property {number[][]} matrix
 * @property {number} max_value
 * @property {number} default_visible_word_count
 * @property {number} total_word_count
 */

/**
 * @typedef {Object} BigramHeatmapState
 * @property {BigramHeatmapData | null} data
 * @property {boolean} loading
 * @property {string | null} error
 */

/**
 * @param {number} value
 * @param {number} maxValue
 * @returns {string}
 */
function getHeatLevelClassName(value, maxValue) {
  if (value <= 0 || maxValue <= 0) {
    return "heat-0";
  }

  const bucket = Math.min(8, Math.max(1, Math.ceil((value / maxValue) * 8)));
  return `heat-${bucket}`;
}

/**
 * @param {{
 *   submissionId: string | null,
 *   heatmapState: BigramHeatmapState,
 *   showAllWords: boolean,
 *   onToggleWordCount: () => void,
 *   rankedByLabel?: string,
 *   emptyMessage?: string,
 *   fillAvailableHeight?: boolean
 * }} props
 * @returns {React.JSX.Element}
 */
function BigramHeatmapSection({
  submissionId,
  heatmapState,
  showAllWords,
  onToggleWordCount,
  rankedByLabel = "topic specificity and co-occurrence",
  emptyMessage = "No heatmap data available.",
  fillAvailableHeight = false,
}) {
  const heatmapData = heatmapState.data;

  if (heatmapState.loading) {
    return <p className="topic-heatmap-status">Loading heatmap…</p>;
  }

  if (heatmapState.error) {
    return (
      <p className="topic-heatmap-status">
        Heatmap unavailable: {heatmapState.error}
      </p>
    );
  }

  if (
    !heatmapData ||
    !Array.isArray(heatmapData.words) ||
    heatmapData.words.length === 0
  ) {
    return <p className="topic-heatmap-status">{emptyMessage}</p>;
  }

  const allRowWords = heatmapData.words;
  const allColWords = Array.isArray(heatmapData.col_words)
    ? heatmapData.col_words
    : heatmapData.words;
  const matrix = Array.isArray(heatmapData.matrix) ? heatmapData.matrix : [];
  const defaultVisibleWordCount = heatmapData.default_visible_word_count || 40;
  const totalWordCount = heatmapData.total_word_count || allRowWords.length;
  const visibleWordCount = showAllWords
    ? allRowWords.length
    : Math.min(defaultVisibleWordCount, allRowWords.length);
  const words = allRowWords.slice(0, visibleWordCount);
  const colWords = allColWords.slice(0, visibleWordCount);
  const visibleMatrix = matrix
    .slice(0, visibleWordCount)
    .map((row) => row.slice(0, visibleWordCount));
  const showWordCountToggle = totalWordCount > defaultVisibleWordCount;

  return (
    <div
      className={`topic-heatmap${fillAvailableHeight ? " topic-heatmap--fill" : ""}`}
    >
      <div className="topic-heatmap-meta">
        <span>
          Window: {heatmapData.window_size} · Normalization:{" "}
          {heatmapData.normalization} · Ranked by {rankedByLabel}
        </span>
        {showWordCountToggle && (
          <button
            type="button"
            className="topic-heatmap-toggle"
            onClick={onToggleWordCount}
          >
            {showAllWords
              ? `Show top ${defaultVisibleWordCount}`
              : `Show all ${totalWordCount} words`}
          </button>
        )}
      </div>

      <div
        className="topic-heatmap-scroll"
        role="region"
        aria-label="Bigram heatmap"
      >
        <table className="topic-heatmap-table">
          <thead>
            <tr>
              <th scope="col" className="topic-heatmap-corner">
                Word
              </th>
              {colWords.map((entry) => (
                <th
                  key={`column-${entry.word}`}
                  scope="col"
                  className="topic-heatmap-column-header"
                >
                  <a
                    href={`/page/word/${submissionId}/${encodeURIComponent(entry.word)}`}
                    className="topic-heatmap-word-link"
                  >
                    {entry.word}
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {words.map((rowEntry, rowIndex) => (
              <tr key={`row-${rowEntry.word}`}>
                <th
                  scope="row"
                  className="topic-heatmap-row-header"
                  title={`${rowEntry.word} (${rowEntry.frequency})`}
                >
                  <a
                    href={`/page/word/${submissionId}/${encodeURIComponent(rowEntry.word)}`}
                    className="topic-heatmap-word-link"
                  >
                    {rowEntry.word}
                  </a>
                </th>
                {colWords.map((columnEntry, columnIndex) => {
                  const cellValue = visibleMatrix[rowIndex]?.[columnIndex] || 0;
                  const heatLevelClassName = getHeatLevelClassName(
                    cellValue,
                    heatmapData.max_value,
                  );

                  return (
                    <td
                      key={`cell-${rowEntry.word}-${columnEntry.word}`}
                      className={`topic-heatmap-cell ${heatLevelClassName}${rowEntry.word === columnEntry.word ? " is-diagonal" : ""}`}
                    >
                      {cellValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BigramHeatmapSection;
