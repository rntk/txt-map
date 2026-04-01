import React from 'react';
import FullScreenGraph from './FullScreenGraph';
import MindmapResults from './MindmapResults';
import CircularPackingChart from './CircularPackingChart';
import GridView from './GridView';
import TopicsBarChart from './TopicsBarChart';
import RadarChart from './RadarChart';
import ArticleStructureChart from './ArticleStructureChart';
import TreemapChart from './TreemapChart';
import TopicsVennChart from './TopicsVennChart';

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
          <div className="topics-bar-chart-container">
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
          <div style={{ padding: '2px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              <CircularPackingChart topics={chartTopics} sentences={chartSentences} />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'radar_chart' && (
        <FullScreenGraph title="Radar Chart" onClose={onClose}>
          <div style={{ padding: '2px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <RadarChart topics={chartTopics} sentences={chartSentences} />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'venn' && (
        <FullScreenGraph title="Venn Diagram" onClose={onClose}>
          <div style={{ padding: '2px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TopicsVennChart topics={allTopics} sentences={chartSentences} />
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
          <div style={{ padding: '2px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <ArticleStructureChart topics={chartTopics} sentences={chartSentences} />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'treemap' && (
        <FullScreenGraph title="Treemap" onClose={onClose}>
          <div style={{ padding: '2px', flex: 1, display: 'flex', flexDirection: 'column' }}>
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
