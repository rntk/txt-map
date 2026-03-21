import React from 'react';
import FullScreenGraph from './FullScreenGraph';
import MindmapResults from './MindmapResults';
import CircularPackingChart from './CircularPackingChart';
import GridView from './GridView';
import TopicsBarChart from './TopicsBarChart';
import RadarChart from './RadarChart';
import ArticleStructureChart from './ArticleStructureChart';
import TreemapChart from './TreemapChart';

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
      {fullscreenGraph === 'topics' && (
        <FullScreenGraph title="Topics" onClose={onClose}>
          <div className="topics-bar-chart-container" style={{ padding: '20px' }}>
            <TopicsBarChart topics={allTopics} sentences={chartSentences} />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'mindmap' && (
        <MindmapResults
          mindmapData={mindmapData}
          fullscreen={true}
          onCloseFullscreen={onClose}
        />
      )}

      {fullscreenGraph === 'circular_packing' && (
        <FullScreenGraph title="Topic Circles" onClose={onClose}>
          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p style={{ marginBottom: '12px' }}>
              Hierarchical circle packing: top-level topics contain their subtopics. Circle size reflects sentence count.
            </p>
            <div style={{ flex: 1 }}>
              <CircularPackingChart topics={chartTopics} sentences={chartSentences} />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'radar_chart' && (
        <FullScreenGraph title="Radar Chart" onClose={onClose}>
          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <RadarChart topics={chartTopics} sentences={chartSentences} />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'grid_view' && (
        <GridView
          topics={chartTopics}
          topicSummaries={{}}
          sentences={chartSentences}
          onClose={onClose}
        />
      )}

      {fullscreenGraph === 'dataset_structure' && (
        <FullScreenGraph title="Dataset Structure" onClose={onClose}>
          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <ArticleStructureChart topics={chartTopics} sentences={chartSentences} />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'treemap' && (
        <FullScreenGraph title="Treemap" onClose={onClose}>
          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p style={{ marginBottom: '12px' }}>
              Treemap visualization: top-level topics contain their subtopics. Rectangle size reflects sentence count.
            </p>
            <div style={{ flex: 1 }}>
              <TreemapChart topics={chartTopics} sentences={chartSentences} />
            </div>
          </div>
        </FullScreenGraph>
      )}
    </>
  );
}

export default React.memo(GlobalVisualizationPanels);
