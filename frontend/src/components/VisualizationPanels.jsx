import React from 'react';
import FullScreenGraph from './FullScreenGraph';
import TopicsRiverChart from './TopicsRiverChart';
import SubtopicsRiverChart from './SubtopicsRiverChart';
import MarimekkoChartTab from './MarimekkoChartTab';
import MindmapResults from './MindmapResults';
import PrefixTreeResults from './PrefixTreeResults';
import TopicsTagCloud from './TopicsTagCloud';
import CircularPackingChart from './CircularPackingChart';
import GridView from './GridView';
import TopicsBarChart from './TopicsBarChart';
import RadarChart from './RadarChart';
import ArticleStructureChart from './ArticleStructureChart';

function VisualizationPanels({
  fullscreenGraph,
  onClose,
  safeTopics,
  safeSentences,
  results,
  submissionId,
  allTopics,
  onShowInArticle,
}) {
  return (
    <>
      {fullscreenGraph === 'topics' && (
        <FullScreenGraph title="Topics" onClose={onClose}>
          <div className="topics-bar-chart-container" style={{ padding: '20px' }}>
            <TopicsBarChart topics={allTopics} sentences={safeSentences} onShowInArticle={onShowInArticle} />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'topics_river' && (
        <FullScreenGraph title="Topics River" onClose={onClose}>
          <div className="topics-river-container" style={{ padding: '20px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
            <div style={{ marginBottom: '60px' }}>
              <h2>Topics River</h2>
              <p>Visualization of topic density across the article.</p>
              <TopicsRiverChart topics={safeTopics} sentences={safeSentences} articleLength={safeSentences.length} onShowInArticle={onShowInArticle} />
            </div>
            <div className="subtopics-river-section">
              <h2>Subtopics River</h2>
              <p>Visualization of subtopics for each chapter. X axis: Global sentence index. Y axis: Chapters.</p>
              {results.subtopics ? (
                <SubtopicsRiverChart
                  topics={safeTopics}
                  subtopics={results.subtopics}
                  sentences={safeSentences}
                  articleLength={safeSentences.length}
                  onShowInArticle={onShowInArticle}
                />
              ) : (
                <p style={{ fontStyle: 'italic', color: '#666' }}>No subtopics data available.</p>
              )}
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'marimekko' && (
        <FullScreenGraph title="Marimekko" onClose={onClose}>
          <div className="marimekko-container" style={{ padding: '20px' }}>
            <MarimekkoChartTab topics={safeTopics} subtopics={results.subtopics} />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'mindmap' && (
        <MindmapResults
          mindmapData={{
            topic_mindmaps: results.topic_mindmaps || {},
            sentences: safeSentences,
          }}
          fullscreen={true}
          onCloseFullscreen={onClose}
        />
      )}

      {fullscreenGraph === 'prefix_tree' && (
        <PrefixTreeResults
          treeData={results.prefix_tree || {}}
          sentences={safeSentences}
          fullscreen={true}
          onCloseFullscreen={onClose}
        />
      )}

      {fullscreenGraph === 'tags_cloud' && (
        <FullScreenGraph title="Tags Cloud" onClose={onClose}>
          <TopicsTagCloud
            submissionId={submissionId}
            topics={safeTopics}
            sentences={safeSentences}
          />
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'circular_packing' && (
        <FullScreenGraph title="Topic Circles" onClose={onClose}>
          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p style={{ marginBottom: '12px' }}>
              Hierarchical circle packing: top-level topics contain their subtopics. Circle size reflects sentence count.
            </p>
            <div style={{ flex: 1 }}>
              <CircularPackingChart topics={safeTopics} sentences={safeSentences} onShowInArticle={onShowInArticle} />
            </div>
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'radar_chart' && (
        <FullScreenGraph title="Radar Chart" onClose={onClose}>
          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <RadarChart topics={safeTopics} sentences={safeSentences} />
          </div>
        </FullScreenGraph>
      )}

      {fullscreenGraph === 'grid_view' && (
        <GridView
          topics={safeTopics}
          topicSummaries={results.topic_summaries || {}}
          sentences={safeSentences}
          onClose={onClose}
        />
      )}

      {fullscreenGraph === 'article_structure' && (
        <FullScreenGraph title="Article Structure" onClose={onClose}>
          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <ArticleStructureChart topics={safeTopics} sentences={safeSentences} onShowInArticle={onShowInArticle} />
          </div>
        </FullScreenGraph>
      )}
    </>
  );
}

export default React.memo(VisualizationPanels);
