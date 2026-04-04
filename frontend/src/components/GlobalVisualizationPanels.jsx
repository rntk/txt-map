import React from "react";
import FullScreenGraph from "./FullScreenGraph";
import MindmapResults from "./MindmapResults";
import CircularPackingChart from "./CircularPackingChart";
import GridView from "./GridView";
import TopicsBarChart from "./TopicsBarChart";
import RadarChart from "./RadarChart";
import ArticleStructureChart from "./ArticleStructureChart";
import TreemapChart from "./TreemapChart";
import TopicsVennChart from "./TopicsVennChart";
import "../styles/GlobalTopics.css";

/**
 * @typedef {Object} GlobalVisualizationPanelsProps
 * @property {string|null} fullscreenGraph
 * @property {() => void} onClose
 * @property {Array=} chartTopics
 * @property {Array=} chartSentences
 * @property {Array=} allTopics
 * @property {Object=} mindmapData
 */

/**
 * @param {GlobalVisualizationPanelsProps} props
 */
function GlobalVisualizationPanels({
  fullscreenGraph,
  onClose,
  chartTopics,
  chartSentences,
  allTopics,
  mindmapData,
}) {
  return (
    <>
      {fullscreenGraph === "topics" && (
        <FullScreenGraph title="Topics" onClose={onClose}>
          <div className="global-topics-panel-shell">
            <div className="global-topics-panel-body">
              <TopicsBarChart topics={allTopics} sentences={chartSentences} />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "mindmap" && (
        <MindmapResults
          mindmapData={mindmapData}
          fullscreen={true}
          onCloseFullscreen={onClose}
        />
      )}

      {fullscreenGraph === "circular_packing" && (
        <FullScreenGraph title="Topic Circles" onClose={onClose}>
          <div className="global-topics-panel-shell">
            <div className="global-topics-panel-body">
              <CircularPackingChart
                topics={chartTopics}
                sentences={chartSentences}
              />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "radar_chart" && (
        <FullScreenGraph title="Radar Chart" onClose={onClose}>
          <div className="global-topics-panel-shell">
            <div className="global-topics-panel-body">
              <RadarChart topics={chartTopics} sentences={chartSentences} />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "venn" && (
        <FullScreenGraph title="Venn Diagram" onClose={onClose}>
          <div className="global-topics-panel-shell">
            <div className="global-topics-panel-body">
              <TopicsVennChart topics={allTopics} sentences={chartSentences} />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "grid_view" && (
        <GridView
          topics={chartTopics}
          topicSummaries={{}}
          sentences={chartSentences}
          onClose={onClose}
        />
      )}

      {fullscreenGraph === "dataset_structure" && (
        <FullScreenGraph title="Dataset Structure" onClose={onClose}>
          <div className="global-topics-panel-shell">
            <div className="global-topics-panel-body">
              <ArticleStructureChart
                topics={chartTopics}
                sentences={chartSentences}
              />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "treemap" && (
        <FullScreenGraph title="Treemap" onClose={onClose}>
          <div className="global-topics-panel-shell">
            <div className="global-topics-panel-body">
              <TreemapChart topics={chartTopics} sentences={chartSentences} />
            </div>
          </div>
        </FullScreenGraph>
      )}
    </>
  );
}

export default React.memo(GlobalVisualizationPanels);
