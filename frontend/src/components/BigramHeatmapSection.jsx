import React, { useCallback, useEffect, useState } from "react";
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
 * @param {string | null} submissionId
 * @param {string} rowWord
 * @param {string} columnWord
 * @returns {string | null}
 */
function buildBigramHighlightHref(submissionId, rowWord, columnWord) {
  if (!submissionId) {
    return null;
  }

  const searchParams = new URLSearchParams({
    words: `${rowWord},${columnWord}`,
  });
  return `/page/text/${submissionId}?${searchParams.toString()}`;
}

/**
 * @param {string} word
 * @param {string} filterValue
 * @returns {boolean}
 */
function matchesWordFilter(word, filterValue) {
  if (!filterValue) {
    return true;
  }

  return word.toLowerCase().includes(filterValue);
}

/**
 * @param {number} currentPage
 * @param {number} pageCount
 * @returns {number}
 */
function clampPage(currentPage, pageCount) {
  return Math.min(Math.max(currentPage, 1), Math.max(pageCount, 1));
}

/**
 * @param {number} page
 * @param {number} pageSize
 * @returns {number}
 */
function getPageStartIndex(page, pageSize) {
  return (page - 1) * pageSize;
}

/**
 * @param {{
 *   submissionId: string | null,
 *   heatmapState: BigramHeatmapState,
 *   showAllWords: boolean,
 *   onToggleWordCount: () => void,
 *   rankedByLabel?: string,
 *   emptyMessage?: string,
 *   fillAvailableHeight?: boolean,
 *   metaPrefix?: string,
 *   columnFilterLabel?: string,
 *   rowFilterLabel?: string,
 *   ariaLabel?: string,
 *   renderColumnHeader?: (entry: BigramHeatmapWord) => React.ReactNode,
 *   renderRowHeader?: (entry: BigramHeatmapWord) => React.ReactNode,
 *   buildCellHref?: (submissionId: string | null, rowEntry: BigramHeatmapWord, columnEntry: BigramHeatmapWord) => string | null,
 *   buildCellAriaLabel?: (rowEntry: BigramHeatmapWord, columnEntry: BigramHeatmapWord) => string,
 *   diagonalEnabled?: boolean
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
  metaPrefix,
  columnFilterLabel = "Filter columns",
  rowFilterLabel = "Filter rows",
  ariaLabel = "Bigram heatmap",
  renderColumnHeader,
  renderRowHeader,
  buildCellHref,
  buildCellAriaLabel,
  diagonalEnabled = true,
}) {
  const [columnFilterValue, setColumnFilterValue] = useState("");
  const [rowFilterValue, setRowFilterValue] = useState("");
  const [activeRowIndex, setActiveRowIndex] = useState(null);
  const [activeColumnIndex, setActiveColumnIndex] = useState(null);
  const [pinnedRowIndex, setPinnedRowIndex] = useState(null);
  const [pinnedColumnIndex, setPinnedColumnIndex] = useState(null);
  const [nonZeroColumnIndices, setNonZeroColumnIndices] = useState(
    () => new Set(),
  );
  const [nonZeroRowIndices, setNonZeroRowIndices] = useState(() => new Set());
  const [sortByColumnIndex, setSortByColumnIndex] = useState(null);
  const [sortByRowIndex, setSortByRowIndex] = useState(null);
  const [rowPage, setRowPage] = useState(1);
  const [columnPage, setColumnPage] = useState(1);
  const heatmapData = heatmapState.data;

  useEffect(() => {
    setColumnFilterValue("");
    setRowFilterValue("");
    setActiveRowIndex(null);
    setActiveColumnIndex(null);
    setPinnedRowIndex(null);
    setPinnedColumnIndex(null);
    setNonZeroColumnIndices(new Set());
    setNonZeroRowIndices(new Set());
    setSortByColumnIndex(null);
    setSortByRowIndex(null);
    setRowPage(1);
    setColumnPage(1);
  }, [submissionId, heatmapData]);

  const toggleNonZeroColumn = useCallback((columnIndex) => {
    setNonZeroColumnIndices((current) => {
      const next = new Set(current);
      if (next.has(columnIndex)) {
        next.delete(columnIndex);
      } else {
        next.add(columnIndex);
      }
      return next;
    });
    setRowPage(1);
  }, []);

  const toggleNonZeroRow = useCallback((rowIndex) => {
    setNonZeroRowIndices((current) => {
      const next = new Set(current);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
    setColumnPage(1);
  }, []);

  const toggleSortByColumn = useCallback((columnIndex) => {
    setSortByColumnIndex((current) =>
      current === columnIndex ? null : columnIndex,
    );
    setRowPage(1);
  }, []);

  const toggleSortByRow = useCallback((rowIndex) => {
    setSortByRowIndex((current) => (current === rowIndex ? null : rowIndex));
    setColumnPage(1);
  }, []);

  const handleHoverPosition = useCallback((rowIndex, columnIndex) => {
    setActiveRowIndex(rowIndex);
    setActiveColumnIndex(columnIndex);
  }, []);

  const handleClearHover = useCallback(() => {
    setActiveRowIndex(null);
    setActiveColumnIndex(null);
  }, []);

  const togglePinnedRow = useCallback((rowIndex) => {
    setPinnedRowIndex((current) => (current === rowIndex ? null : rowIndex));
  }, []);

  const togglePinnedColumn = useCallback((columnIndex) => {
    setPinnedColumnIndex((current) =>
      current === columnIndex ? null : columnIndex,
    );
  }, []);

  const togglePinnedCell = useCallback((rowIndex, columnIndex) => {
    setPinnedRowIndex((current) => (current === rowIndex ? null : rowIndex));
    setPinnedColumnIndex((current) =>
      current === columnIndex ? null : columnIndex,
    );
  }, []);

  const handleToggleWordCount = useCallback(() => {
    setRowPage(1);
    setColumnPage(1);
    onToggleWordCount();
  }, [onToggleWordCount]);

  const handleColumnFilterChange = useCallback(
    /** @param {React.ChangeEvent<HTMLInputElement>} event */
    (event) => {
      setColumnFilterValue(event.target.value);
      setColumnPage(1);
    },
    [],
  );

  const handleRowFilterChange = useCallback(
    /** @param {React.ChangeEvent<HTMLInputElement>} event */
    (event) => {
      setRowFilterValue(event.target.value);
      setRowPage(1);
    },
    [],
  );

  const effectiveRowIndex =
    activeRowIndex !== null ? activeRowIndex : pinnedRowIndex;
  const effectiveColumnIndex =
    activeColumnIndex !== null ? activeColumnIndex : pinnedColumnIndex;

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
  const pageSize = Math.max(1, defaultVisibleWordCount);
  const normalizedColumnFilterValue = columnFilterValue.trim().toLowerCase();
  const normalizedRowFilterValue = rowFilterValue.trim().toLowerCase();
  const filteredRowEntries = allRowWords
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (!matchesWordFilter(entry.word, normalizedRowFilterValue)) {
        return false;
      }
      for (const columnIndex of nonZeroColumnIndices) {
        if (!(matrix[index]?.[columnIndex] > 0)) {
          return false;
        }
      }
      return true;
    });
  if (sortByColumnIndex !== null) {
    filteredRowEntries.sort(
      ({ index: a }, { index: b }) =>
        (matrix[b]?.[sortByColumnIndex] || 0) -
        (matrix[a]?.[sortByColumnIndex] || 0),
    );
  }
  const filteredColumnEntries = allColWords
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (!matchesWordFilter(entry.word, normalizedColumnFilterValue)) {
        return false;
      }
      for (const rowIndex of nonZeroRowIndices) {
        if (!(matrix[rowIndex]?.[index] > 0)) {
          return false;
        }
      }
      return true;
    });
  if (sortByRowIndex !== null) {
    filteredColumnEntries.sort(
      ({ index: a }, { index: b }) =>
        (matrix[sortByRowIndex]?.[b] || 0) - (matrix[sortByRowIndex]?.[a] || 0),
    );
  }
  const rowPageCount = showAllWords
    ? Math.ceil(filteredRowEntries.length / pageSize)
    : 1;
  const columnPageCount = showAllWords
    ? Math.ceil(filteredColumnEntries.length / pageSize)
    : 1;
  const effectiveRowPage = showAllWords ? clampPage(rowPage, rowPageCount) : 1;
  const effectiveColumnPage = showAllWords
    ? clampPage(columnPage, columnPageCount)
    : 1;
  const rowStartIndex = showAllWords
    ? getPageStartIndex(effectiveRowPage, pageSize)
    : 0;
  const columnStartIndex = showAllWords
    ? getPageStartIndex(effectiveColumnPage, pageSize)
    : 0;
  const visibleRowEntries = showAllWords
    ? filteredRowEntries.slice(rowStartIndex, rowStartIndex + pageSize)
    : filteredRowEntries.slice(0, pageSize);
  const visibleColumnEntries = showAllWords
    ? filteredColumnEntries.slice(columnStartIndex, columnStartIndex + pageSize)
    : filteredColumnEntries.slice(0, pageSize);
  const showWordCountToggle = totalWordCount > defaultVisibleWordCount;
  const showRowPagination = showAllWords && rowPageCount > 1;
  const showColumnPagination = showAllWords && columnPageCount > 1;
  const hasVisibleRows = visibleRowEntries.length > 0;
  const hasVisibleColumns = visibleColumnEntries.length > 0;

  return (
    <div
      className={`topic-heatmap${fillAvailableHeight ? " topic-heatmap--fill" : ""}`}
    >
      <div className="topic-heatmap-meta">
        <span>
          {metaPrefix
            ? metaPrefix
            : `Window: ${heatmapData.window_size} · Normalization: ${heatmapData.normalization} · Ranked by ${rankedByLabel}`}
        </span>
        {showWordCountToggle && (
          <button
            type="button"
            className="topic-heatmap-toggle"
            onClick={handleToggleWordCount}
          >
            {showAllWords
              ? `Show top ${defaultVisibleWordCount}`
              : `Show all ${totalWordCount} words`}
          </button>
        )}
      </div>

      {(showRowPagination || showColumnPagination) && (
        <div className="topic-heatmap-pagination">
          {showRowPagination && (
            <div className="topic-heatmap-pagination__group">
              <span className="topic-heatmap-pagination__label">
                Rows {rowStartIndex + 1}-
                {Math.min(rowStartIndex + pageSize, filteredRowEntries.length)}{" "}
                of {filteredRowEntries.length}
              </span>
              <button
                type="button"
                className="topic-heatmap-page-button"
                onClick={() =>
                  setRowPage((currentPage) =>
                    clampPage(currentPage - 1, rowPageCount),
                  )
                }
                disabled={effectiveRowPage <= 1}
              >
                Previous rows
              </button>
              <span className="topic-heatmap-pagination__page">
                Page {effectiveRowPage} of {rowPageCount}
              </span>
              <button
                type="button"
                className="topic-heatmap-page-button"
                onClick={() =>
                  setRowPage((currentPage) =>
                    clampPage(currentPage + 1, rowPageCount),
                  )
                }
                disabled={effectiveRowPage >= rowPageCount}
              >
                Next rows
              </button>
            </div>
          )}
          {showColumnPagination && (
            <div className="topic-heatmap-pagination__group">
              <span className="topic-heatmap-pagination__label">
                Columns {columnStartIndex + 1}-
                {Math.min(
                  columnStartIndex + pageSize,
                  filteredColumnEntries.length,
                )}{" "}
                of {filteredColumnEntries.length}
              </span>
              <button
                type="button"
                className="topic-heatmap-page-button"
                onClick={() =>
                  setColumnPage((currentPage) =>
                    clampPage(currentPage - 1, columnPageCount),
                  )
                }
                disabled={effectiveColumnPage <= 1}
              >
                Previous columns
              </button>
              <span className="topic-heatmap-pagination__page">
                Page {effectiveColumnPage} of {columnPageCount}
              </span>
              <button
                type="button"
                className="topic-heatmap-page-button"
                onClick={() =>
                  setColumnPage((currentPage) =>
                    clampPage(currentPage + 1, columnPageCount),
                  )
                }
                disabled={effectiveColumnPage >= columnPageCount}
              >
                Next columns
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className="topic-heatmap-scroll"
        role="region"
        aria-label={ariaLabel}
        onPointerLeave={handleClearHover}
      >
        <table className="topic-heatmap-table">
          <thead>
            <tr>
              <th scope="col" className="topic-heatmap-corner">
                <label className="topic-heatmap-filter">
                  <span className="topic-heatmap-filter__label">Columns</span>
                  <input
                    type="search"
                    value={columnFilterValue}
                    onChange={handleColumnFilterChange}
                    className="topic-heatmap-filter__input"
                    placeholder={columnFilterLabel}
                    aria-label={columnFilterLabel}
                  />
                </label>
                <label className="topic-heatmap-filter">
                  <span className="topic-heatmap-filter__label">Rows</span>
                  <input
                    type="search"
                    value={rowFilterValue}
                    onChange={handleRowFilterChange}
                    className="topic-heatmap-filter__input"
                    placeholder={rowFilterLabel}
                    aria-label={rowFilterLabel}
                  />
                </label>
              </th>
              {visibleColumnEntries.map(({ entry, index: columnIndex }) => {
                const isColumnActive = effectiveColumnIndex === columnIndex;
                const isColumnPinned = pinnedColumnIndex === columnIndex;
                return (
                  <th
                    key={`column-${entry.word}`}
                    scope="col"
                    aria-label={entry.word}
                    className={`topic-heatmap-column-header${
                      isColumnActive ? " is-active" : ""
                    }${isColumnPinned ? " is-pinned" : ""}`}
                    onPointerEnter={() =>
                      handleHoverPosition(null, columnIndex)
                    }
                    onClick={(event) => {
                      const target = event.target;
                      if (
                        target instanceof HTMLElement &&
                        target.closest("a")
                      ) {
                        return;
                      }
                      togglePinnedColumn(columnIndex);
                    }}
                  >
                    {renderColumnHeader ? (
                      renderColumnHeader(entry)
                    ) : (
                      <a
                        href={`/page/word/${submissionId}/${encodeURIComponent(entry.word)}`}
                        className="topic-heatmap-word-link"
                      >
                        {entry.word}
                      </a>
                    )}
                    <div className="topic-heatmap-column-actions">
                      <label
                        className="topic-heatmap-nonzero"
                        onClick={(event) => event.stopPropagation()}
                        title="Hide rows whose value in this column is 0"
                      >
                        <input
                          type="checkbox"
                          checked={nonZeroColumnIndices.has(columnIndex)}
                          onChange={() => toggleNonZeroColumn(columnIndex)}
                          aria-label={`Hide rows with zero value in ${entry.word}`}
                        />
                        <span>≠0</span>
                      </label>
                      <label
                        className="topic-heatmap-nonzero"
                        onClick={(event) => event.stopPropagation()}
                        title="Sort rows by this column in descending order"
                      >
                        <input
                          type="checkbox"
                          checked={sortByColumnIndex === columnIndex}
                          onChange={() => toggleSortByColumn(columnIndex)}
                          aria-label={`Sort rows by ${entry.word} descending`}
                        />
                        <span>sort</span>
                      </label>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!hasVisibleRows || !hasVisibleColumns ? (
              <tr>
                <td
                  colSpan={visibleColumnEntries.length + 1}
                  className="topic-heatmap-empty-results"
                >
                  No matching rows or columns.
                </td>
              </tr>
            ) : (
              visibleRowEntries.map(({ entry: rowEntry, index: rowIndex }) => {
                const isRowActive = effectiveRowIndex === rowIndex;
                const isRowPinned = pinnedRowIndex === rowIndex;
                return (
                  <tr
                    key={`row-${rowEntry.word}`}
                    className={`${isRowActive ? "is-active-row" : ""}${
                      isRowPinned ? " is-pinned-row" : ""
                    }`}
                  >
                    <th
                      scope="row"
                      aria-label={rowEntry.word}
                      className={`topic-heatmap-row-header${
                        isRowActive ? " is-active" : ""
                      }${isRowPinned ? " is-pinned" : ""}`}
                      title={`${rowEntry.word} (${rowEntry.frequency})`}
                      onPointerEnter={() => handleHoverPosition(rowIndex, null)}
                      onClick={(event) => {
                        const target = event.target;
                        if (
                          target instanceof HTMLElement &&
                          target.closest("a")
                        ) {
                          return;
                        }
                        togglePinnedRow(rowIndex);
                      }}
                    >
                      <div className="topic-heatmap-row-content">
                        {renderRowHeader ? (
                          renderRowHeader(rowEntry)
                        ) : (
                          <a
                            href={`/page/word/${submissionId}/${encodeURIComponent(rowEntry.word)}`}
                            className="topic-heatmap-word-link"
                          >
                            {rowEntry.word}
                          </a>
                        )}
                        <div className="topic-heatmap-row-actions">
                          <label
                            className="topic-heatmap-nonzero"
                            onClick={(event) => event.stopPropagation()}
                            title="Hide columns whose value in this row is 0"
                          >
                            <input
                              type="checkbox"
                              checked={nonZeroRowIndices.has(rowIndex)}
                              onChange={() => toggleNonZeroRow(rowIndex)}
                              aria-label={`Hide columns with zero value in ${rowEntry.word}`}
                            />
                            <span>≠0</span>
                          </label>
                          <label
                            className="topic-heatmap-nonzero"
                            onClick={(event) => event.stopPropagation()}
                            title="Sort columns by this row in descending order"
                          >
                            <input
                              type="checkbox"
                              checked={sortByRowIndex === rowIndex}
                              onChange={() => toggleSortByRow(rowIndex)}
                              aria-label={`Sort columns by ${rowEntry.word} descending`}
                            />
                            <span>sort</span>
                          </label>
                        </div>
                      </div>
                    </th>
                    {visibleColumnEntries.map(
                      ({ entry: columnEntry, index: columnIndex }) => {
                        const cellValue = matrix[rowIndex]?.[columnIndex] || 0;
                        const heatLevelClassName = getHeatLevelClassName(
                          cellValue,
                          heatmapData.max_value,
                        );
                        const cellHref = buildCellHref
                          ? buildCellHref(submissionId, rowEntry, columnEntry)
                          : buildBigramHighlightHref(
                              submissionId,
                              rowEntry.word,
                              columnEntry.word,
                            );
                        const cellAriaLabel = buildCellAriaLabel
                          ? buildCellAriaLabel(rowEntry, columnEntry)
                          : `Highlight ${rowEntry.word} ${columnEntry.word} in article`;
                        const isDiagonal =
                          diagonalEnabled && rowEntry.word === columnEntry.word;
                        const isColumnActive =
                          effectiveColumnIndex === columnIndex;
                        const isColumnPinned =
                          pinnedColumnIndex === columnIndex;
                        const isCellFocus = isRowActive && isColumnActive;
                        const cellClassName = [
                          "topic-heatmap-cell",
                          heatLevelClassName,
                          isDiagonal ? "is-diagonal" : "",
                          isRowActive ? "is-active-row" : "",
                          isColumnActive ? "is-active-column" : "",
                          isCellFocus ? "is-focus" : "",
                          isRowPinned ? "is-pinned-row" : "",
                          isColumnPinned ? "is-pinned-column" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");

                        return (
                          <td
                            key={`cell-${rowEntry.word}-${columnEntry.word}`}
                            className={cellClassName}
                            onPointerEnter={() =>
                              handleHoverPosition(rowIndex, columnIndex)
                            }
                            onClick={(event) => {
                              const target = event.target;
                              if (
                                target instanceof HTMLElement &&
                                target.closest("a")
                              ) {
                                return;
                              }
                              togglePinnedCell(rowIndex, columnIndex);
                            }}
                          >
                            {cellHref ? (
                              <a
                                href={cellHref}
                                className="topic-heatmap-cell-link"
                                aria-label={cellAriaLabel}
                              >
                                {cellValue}
                              </a>
                            ) : (
                              cellValue
                            )}
                          </td>
                        );
                      },
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BigramHeatmapSection;
