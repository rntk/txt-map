import React, { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "./shared/Breadcrumbs";
import { useScopeNavigation } from "../hooks/useScopeNavigation";
import "./TagFrequencyChart.css";

/**
 * @typedef {Object} TagFrequencyTopicLink
 * @property {string} label
 * @property {string} full_path
 * @property {number} frequency
 *
 * @typedef {Object} TagFrequencyRow
 * @property {string} word
 * @property {number} frequency
 * @property {TagFrequencyTopicLink[]} topics
 *
 * @typedef {Object} TagFrequencyResponse
 * @property {string[]} scope_path
 * @property {number} sentence_count
 * @property {TagFrequencyRow[]} rows
 *
 * @typedef {Object} TagFrequencyChartProps
 * @property {string | number} submissionId
 */

const TOPIC_PREVIEW_LIMIT = 2;
const WIDTH_BUCKETS = 20;
const PALETTE_CLASS_NAMES = [
  "tag-frequency-chart__bar-fill--palette-0",
  "tag-frequency-chart__bar-fill--palette-1",
  "tag-frequency-chart__bar-fill--palette-2",
  "tag-frequency-chart__bar-fill--palette-3",
  "tag-frequency-chart__bar-fill--palette-4",
  "tag-frequency-chart__bar-fill--palette-5",
];

function getWidthBucket(frequency, maxFrequency) {
  if (!Number.isFinite(frequency) || frequency <= 0 || maxFrequency <= 0) {
    return 1;
  }

  const normalized = Math.max(
    1,
    Math.round((frequency / maxFrequency) * WIDTH_BUCKETS),
  );
  return Math.min(WIDTH_BUCKETS, normalized);
}

function isWordLikelyTruncated(word, widthBucket) {
  if (typeof word !== "string" || word.length === 0) {
    return false;
  }

  return word.length > widthBucket * 0.7;
}

/**
 * @param {TagFrequencyChartProps} props
 * @returns {React.ReactElement}
 */
function TagFrequencyChart({ submissionId }) {
  const { scopePath, navigateTo, drillInto } = useScopeNavigation();
  /** @type {[TagFrequencyRow[], React.Dispatch<React.SetStateAction<TagFrequencyRow[]>>]} */
  const [rows, setRows] = useState([]);
  const [sentenceCount, setSentenceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openPopoverWord, setOpenPopoverWord] = useState(null);
  const [hoveredWord, setHoveredWord] = useState(null);
  const [pinnedWord, setPinnedWord] = useState(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      scopePath.forEach((segment) => params.append("path", segment));
      const queryString = params.toString();
      const response = await fetch(
        `/api/submission/${submissionId}/tag-frequency${queryString ? `?${queryString}` : ""}`,
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }

      /** @type {TagFrequencyResponse} */
      const payload = await response.json();
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setSentenceCount(
        Number.isFinite(payload.sentence_count) ? payload.sentence_count : 0,
      );
    } catch (fetchError) {
      setRows([]);
      setSentenceCount(0);
      setError(
        fetchError instanceof Error ? fetchError.message : String(fetchError),
      );
    } finally {
      setLoading(false);
    }
  }, [scopePath, submissionId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    setOpenPopoverWord(null);
  }, [scopePath]);

  useEffect(() => {
    if (!openPopoverWord) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      if (event.target.closest(".tag-frequency-chart__topics-more-wrap")) {
        return;
      }
      setOpenPopoverWord(null);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenPopoverWord(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPopoverWord]);

  const maxFrequency = useMemo(() => {
    if (rows.length === 0) {
      return 1;
    }
    return Math.max(...rows.map((row) => row.frequency), 1);
  }, [rows]);

  const handleTopicClick = useCallback(
    (fullPath) => {
      drillInto(fullPath);
      setOpenPopoverWord(null);
    },
    [drillInto],
  );

  return (
    <div className="tag-frequency-chart chart-surface chart-surface--topics">
      <div className="tag-frequency-chart__controls">
        <Breadcrumbs
          scopePath={scopePath}
          onNavigate={navigateTo}
          classPrefix="tag-frequency-chart__"
        />
        <p className="tag-frequency-chart__scope-copy">
          {sentenceCount} sentence{sentenceCount !== 1 ? "s" : ""} in scope
        </p>
      </div>

      {loading ? (
        <div className="tag-frequency-chart__state">
          Loading tag frequencies…
        </div>
      ) : error ? (
        <div className="tag-frequency-chart__state tag-frequency-chart__state--error">
          Failed to load tag frequencies: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="tag-frequency-chart__state">
          No tag frequencies found for this scope.
        </div>
      ) : (
        <div
          className="tag-frequency-chart__body"
          data-testid="tag-frequency-chart-scroll"
        >
          {rows.map((row, index) => {
            const previewTopics = row.topics.slice(0, TOPIC_PREVIEW_LIMIT);
            const hiddenTopics = row.topics.slice(TOPIC_PREVIEW_LIMIT);
            const widthBucket = getWidthBucket(row.frequency, maxFrequency);
            const paletteClassName =
              PALETTE_CLASS_NAMES[index % PALETTE_CLASS_NAMES.length];
            const isPopoverOpen = openPopoverWord === row.word;
            const shouldShowHint = isWordLikelyTruncated(row.word, widthBucket);
            const isExpanded =
              shouldShowHint &&
              (hoveredWord === row.word || pinnedWord === row.word);

            return (
              <div className="tag-frequency-chart__row" key={row.word}>
                <div className="tag-frequency-chart__topics">
                  {previewTopics.length > 0 ? (
                    previewTopics.map((topic) => (
                      <button
                        key={topic.full_path}
                        type="button"
                        className="tag-frequency-chart__topic-link"
                        onClick={() => handleTopicClick(topic.full_path)}
                      >
                        {topic.label}
                      </button>
                    ))
                  ) : (
                    <span className="tag-frequency-chart__no-topic">
                      No topic
                    </span>
                  )}

                  {hiddenTopics.length > 0 && (
                    <div className="tag-frequency-chart__topics-more-wrap">
                      <button
                        type="button"
                        className="tag-frequency-chart__topics-more"
                        aria-expanded={isPopoverOpen}
                        aria-label={`Show all topics for ${row.word}`}
                        onClick={() =>
                          setOpenPopoverWord((currentWord) =>
                            currentWord === row.word ? null : row.word,
                          )
                        }
                      >
                        ...
                      </button>

                      {isPopoverOpen && (
                        <div
                          className="tag-frequency-chart__topics-popover"
                          role="dialog"
                        >
                          <div className="tag-frequency-chart__topics-popover-title">
                            Topics for {row.word}
                          </div>
                          {row.topics.map((topic) => (
                            <button
                              key={topic.full_path}
                              type="button"
                              className="tag-frequency-chart__topics-popover-link"
                              onClick={() => handleTopicClick(topic.full_path)}
                            >
                              {topic.label}
                              <span className="tag-frequency-chart__topics-popover-frequency">
                                {topic.frequency}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="tag-frequency-chart__bar-shell">
                  <div
                    className={`tag-frequency-chart__bar-fill tag-frequency-chart__bar-fill--w-${widthBucket} ${paletteClassName}${isExpanded ? " tag-frequency-chart__bar-fill--expanded" : ""}`}
                    title={shouldShowHint ? row.word : `${row.word} (${row.frequency})`}
                    onMouseEnter={() => {
                      if (shouldShowHint) {
                        setHoveredWord(row.word);
                      }
                    }}
                    onMouseLeave={() => {
                      if (hoveredWord === row.word) {
                        setHoveredWord(null);
                      }
                    }}
                    onClick={() => {
                      if (!shouldShowHint) {
                        return;
                      }
                      setPinnedWord((currentWord) =>
                        currentWord === row.word ? null : row.word,
                      );
                    }}
                  >
                    {isExpanded && (
                      <span className="tag-frequency-chart__bar-hint">
                        {row.word}
                      </span>
                    )}
                    <a
                      className="tag-frequency-chart__word-link"
                      href={`/page/word/${submissionId}/${encodeURIComponent(row.word)}`}
                      onFocus={() => {
                        if (shouldShowHint) {
                          setHoveredWord(row.word);
                        }
                      }}
                      onBlur={() => {
                        if (hoveredWord === row.word) {
                          setHoveredWord(null);
                        }
                      }}
                    >
                      {row.word}
                    </a>
                    <span className="tag-frequency-chart__bar-frequency">
                      {row.frequency}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TagFrequencyChart;
