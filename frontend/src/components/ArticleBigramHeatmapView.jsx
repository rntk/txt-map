import React, { useEffect, useState } from "react";
import FullScreenGraph from "./FullScreenGraph";
import BigramHeatmapSection from "./BigramHeatmapSection";

/**
 * @typedef {import("./BigramHeatmapSection").BigramHeatmapState} BigramHeatmapState
 */

/**
 * @typedef {Object} ArticleBigramHeatmapViewProps
 * @property {string | null} submissionId
 * @property {() => void} [onClose]
 */

/**
 * @param {ArticleBigramHeatmapViewProps} props
 * @returns {React.JSX.Element}
 */
function ArticleBigramHeatmapView({ submissionId, onClose }) {
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
    setHeatmapState({
      data: null,
      loading: true,
      error: null,
    });

    fetch(
      `/api/submission/${submissionId}/topic-analysis/heatmap?scope=article`,
      {
        signal: controller.signal,
      },
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        setHeatmapState({
          data: json,
          loading: false,
          error: null,
        });
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

  return (
    <FullScreenGraph title="Bigram Heatmap" onClose={onClose}>
      <div className="chart-surface__panel article-bigram-heatmap-view">
        <div className="chart-surface__panel-body article-bigram-heatmap-view__body">
          <BigramHeatmapSection
            submissionId={submissionId}
            heatmapState={heatmapState}
            showAllWords={showAllWords}
            onToggleWordCount={() =>
              setShowAllWords((currentValue) => !currentValue)
            }
            rankedByLabel="article-level co-occurrence strength"
            emptyMessage="No heatmap data available for this article."
            fillAvailableHeight={true}
          />
        </div>
      </div>
    </FullScreenGraph>
  );
}

export default ArticleBigramHeatmapView;
