import React from "react";
import FullScreenGraph from "./FullScreenGraph";
import TopicsRiverChart from "./TopicsRiverChart";
import SubtopicsRiverChart from "./SubtopicsRiverChart";
import MarimekkoChartTab from "./MarimekkoChartTab";
import MindmapResults from "./MindmapResults";
import PrefixTreeResults from "./PrefixTreeResults";
import TopicsTagCloud from "./TopicsTagCloud";
import TagFrequencyChart from "./TagFrequencyChart";
import CircularPackingChart from "./CircularPackingChart";
import GanttChart from "./GanttChart";
import GridView from "./GridView";
import TopicsBarChart from "./TopicsBarChart";
import RadarChart from "./RadarChart";
import ArticleStructureChart from "./ArticleStructureChart";
import TreemapChart from "./TreemapChart";
import TopicsVennChart from "./TopicsVennChart";
import TopicHierarchyFlowChart from "./TopicHierarchyFlowChart";
import ArticleBigramHeatmapView from "./ArticleBigramHeatmapView";
import RadialFlowChart from "./RadialFlowChart";

/**
 * @typedef {Object} VisualizationPanelsProps
 * @property {'venn_chart' | 'topics' | 'topics_river' | 'gantt_chart' | 'marimekko' | 'mindmap' | 'prefix_tree' | 'tags_cloud' | 'tag_frequency' | 'circular_packing' | 'radar_chart' | 'grid_view' | 'article_structure' | 'treemap' | 'topic_hierarchy_flow' | 'article_bigram_heatmap' | 'radial_flow' | null} fullscreenGraph
 * @property {() => void} [onClose]
 * @property {Array<unknown>} safeTopics
 * @property {string[]} safeSentences
 * @property {{ [key: string]: unknown }} results
 * @property {string | number} submissionId
 * @property {Array<unknown>} allTopics
 * @property {(topic: unknown) => void} [onShowInArticle]
 * @property {Set<string> | string[]} [readTopics]
 * @property {(topic: unknown) => void} [onToggleRead]
 * @property {unknown} [markup]
 */

/**
 * @param {VisualizationPanelsProps} props
 */
function VisualizationPanels({
  fullscreenGraph,
  onClose,
  safeTopics,
  safeSentences,
  results,
  submissionId,
  allTopics,
  onShowInArticle,
  readTopics,
  onToggleRead,
  markup,
}) {
  return (
    <>
      {fullscreenGraph === "venn_chart" && (
        <FullScreenGraph title="Topics Venn" onClose={onClose}>
          <div className="chart-surface__panel">
            <div className="chart-surface__panel-body chart-surface__panel-body--scroll">
              <TopicsVennChart
                topics={safeTopics}
                sentences={safeSentences}
                onShowInArticle={onShowInArticle}
                readTopics={readTopics}
                onToggleRead={onToggleRead}
                markup={markup}
              />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "topics" && (
        <FullScreenGraph title="Topics" onClose={onClose}>
          <div className="chart-surface__panel">
            <div className="chart-surface__panel-body">
              <TopicsBarChart
                topics={allTopics}
                sentences={safeSentences}
                onShowInArticle={onShowInArticle}
                readTopics={readTopics}
                onToggleRead={onToggleRead}
                markup={markup}
              />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "article_bigram_heatmap" && (
        <ArticleBigramHeatmapView
          submissionId={submissionId == null ? null : String(submissionId)}
          onClose={onClose}
        />
      )}

      {fullscreenGraph === "topics_river" && (
        <FullScreenGraph title="Topics River" onClose={onClose}>
          <div className="chart-surface chart-surface--embedded chart-scroll-area">
            <section className="chart-section">
              <h2 className="chart-section__title">Topics River</h2>
              <p className="chart-section__copy">
                Visualization of topic density across the article.
              </p>
              <TopicsRiverChart
                topics={safeTopics}
                sentences={safeSentences}
                articleLength={safeSentences.length}
                onShowInArticle={onShowInArticle}
                readTopics={readTopics}
                onToggleRead={onToggleRead}
                markup={markup}
              />
            </section>
            <section className="chart-section">
              <h2 className="chart-section__title">Subtopics River</h2>
              <p className="chart-section__copy">
                Visualization of subtopics for each chapter. X axis: Global
                sentence index. Y axis: Chapters.
              </p>
              {results.subtopics ? (
                <SubtopicsRiverChart
                  topics={safeTopics}
                  subtopics={results.subtopics}
                  sentences={safeSentences}
                  articleLength={safeSentences.length}
                  onShowInArticle={onShowInArticle}
                  readTopics={readTopics}
                  onToggleRead={onToggleRead}
                  markup={markup}
                />
              ) : (
                <p className="chart-empty-state chart-empty-state--compact">
                  No subtopics data available.
                </p>
              )}
            </section>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "gantt_chart" && (
        <FullScreenGraph title="Gantt Chart" onClose={onClose}>
          <div className="chart-surface chart-surface--embedded chart-scroll-area">
            <section className="chart-section">
              <h2 className="chart-section__title">Topics Gantt Chart</h2>
              <p className="chart-section__copy">
                Visualization of topic presence across sentences using a Gantt
                diagram.
              </p>
              <GanttChart
                topics={safeTopics}
                sentences={safeSentences}
                articleLength={safeSentences.length}
                onShowInArticle={onShowInArticle}
                readTopics={readTopics}
                onToggleRead={onToggleRead}
                markup={markup}
              />
            </section>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "marimekko" && (
        <FullScreenGraph title="Marimekko" onClose={onClose}>
          <div className="marimekko-container">
            <MarimekkoChartTab
              topics={safeTopics}
              sentences={safeSentences}
              onShowInArticle={onShowInArticle}
              readTopics={readTopics}
              onToggleRead={onToggleRead}
              markup={markup}
            />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "mindmap" && (
        <MindmapResults
          mindmapData={{
            topic_mindmaps: results.topic_mindmaps || {},
            sentences: safeSentences,
          }}
          fullscreen={true}
          onCloseFullscreen={onClose}
        />
      )}

      {fullscreenGraph === "prefix_tree" && (
        <PrefixTreeResults
          treeData={results.prefix_tree || {}}
          sentences={safeSentences}
          fullscreen={true}
          onCloseFullscreen={onClose}
        />
      )}

      {fullscreenGraph === "tags_cloud" && (
        <FullScreenGraph title="Tags Cloud" onClose={onClose}>
          <TopicsTagCloud
            submissionId={submissionId}
            topics={safeTopics}
            sentences={safeSentences}
            readTopics={readTopics}
            onToggleRead={onToggleRead}
            markup={markup}
            onShowInArticle={onShowInArticle}
          />
        </FullScreenGraph>
      )}

      {fullscreenGraph === "tag_frequency" && (
        <FullScreenGraph title="Tag Frequency" onClose={onClose}>
          <TagFrequencyChart submissionId={submissionId} />
        </FullScreenGraph>
      )}

      {fullscreenGraph === "circular_packing" && (
        <FullScreenGraph title="Topic Circles" onClose={onClose}>
          <div className="chart-surface__panel">
            <div className="chart-surface__panel-body">
              <CircularPackingChart
                topics={safeTopics}
                sentences={safeSentences}
                onShowInArticle={onShowInArticle}
                readTopics={readTopics}
                onToggleRead={onToggleRead}
                markup={markup}
              />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "radar_chart" && (
        <FullScreenGraph title="Radar Chart" onClose={onClose}>
          <div className="chart-surface__panel-body chart-surface__panel-body--padded">
            <RadarChart
              topics={safeTopics}
              sentences={safeSentences}
              readTopics={readTopics}
              onToggleRead={onToggleRead}
              markup={markup}
            />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "grid_view" && (
        <GridView
          topics={safeTopics}
          topicSummaries={results.topic_summaries || {}}
          sentences={safeSentences}
          onClose={onClose}
          readTopics={readTopics}
          onToggleRead={onToggleRead}
          markup={markup}
          onShowInArticle={onShowInArticle}
        />
      )}

      {fullscreenGraph === "article_structure" && (
        <FullScreenGraph title="Article Structure" onClose={onClose}>
          <div className="chart-surface__panel-body chart-surface__panel-body--padded">
            <ArticleStructureChart
              topics={safeTopics}
              sentences={safeSentences}
              onShowInArticle={onShowInArticle}
              readTopics={readTopics}
              onToggleRead={onToggleRead}
              markup={markup}
            />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "treemap" && (
        <FullScreenGraph title="Treemap" onClose={onClose}>
          <div className="chart-surface__panel">
            <div className="chart-surface__panel-body">
              <TreemapChart
                topics={safeTopics}
                sentences={safeSentences}
                onShowInArticle={onShowInArticle}
                readTopics={readTopics}
                onToggleRead={onToggleRead}
                markup={markup}
              />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === "topic_hierarchy_flow" && (
        <FullScreenGraph title="Topic Hierarchy Flow" onClose={onClose}>
          <div className="chart-surface__panel">
            <div className="chart-surface__panel-body chart-surface__panel-body--padded">
              <TopicHierarchyFlowChart
                topics={safeTopics}
                sentences={safeSentences}
                onShowInArticle={onShowInArticle}
                readTopics={readTopics}
                onToggleRead={onToggleRead}
                markup={markup}
              />
            </div>
          </div>
        </FullScreenGraph>
      )}
      {fullscreenGraph === "radial_flow" && (
        <FullScreenGraph title="Radial Flow" onClose={onClose}>
          <div className="chart-surface__panel">
            <div className="chart-surface__panel-body chart-surface__panel-body--padded">
              <RadialFlowChart
                topics={safeTopics}
                sentences={safeSentences}
                onShowInArticle={onShowInArticle}
                readTopics={readTopics}
                onToggleRead={onToggleRead}
                markup={markup}
              />
            </div>
          </div>
        </FullScreenGraph>
      )}
    </>
  );
}

export default React.memo(VisualizationPanels);
