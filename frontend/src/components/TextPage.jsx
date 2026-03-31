import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import TopicList from './TopicList';
import TextDisplay from './TextDisplay';
import ReadProgress from './ReadProgress';
import GroupedByTopicsView from './GroupedByTopicsView';
import TopicSentencesModal from './shared/TopicSentencesModal';
import TextPageActionsPortal from './TextPageActionsPortal';
import VisualizationPanels from './VisualizationPanels';
import SummaryTimeline from './SummaryTimeline';
import TopicSentencePanel from './TopicSentencePanel';
import TextPageToolbar from './TextPageToolbar';
import ArticleTabHeader from './ArticleTabHeader';
import ArticleSummaryView from './ArticleSummaryView';
import ArticleMarkupView from './ArticleMarkupView';
import RawTextView from './RawTextView';
import WordSelectionPopup from './WordSelectionPopup';
import { useSubmission } from '../hooks/useSubmission';
import { useTopicNavigation } from '../hooks/useTopicNavigation';
import { useTextSelection } from '../hooks/useTextSelection';
import { getTopicSelectionKey } from '../utils/chartConstants';
import { useTextPageData } from '../hooks/useTextPageData';
import { getTopicHighlightColor } from '../utils/topicColorUtils';
import '../styles/App.css';

const FULLSCREEN_TABS = [
  { key: 'topic_summary_timeline', label: 'Topic Summaries' },
  { key: 'insights', label: 'Insights' },
  { key: 'topics', label: 'Topics' },
  { key: 'topics_river', label: 'Topics River' },
  { key: 'marimekko', label: 'Marimekko' },
  { key: 'mindmap', label: 'Mindmap' },
  { key: 'prefix_tree', label: 'Prefix Tree' },
  { key: 'tags_cloud', label: 'Tags Cloud' },
  { key: 'circular_packing', label: 'Circles' },
  { key: 'venn_chart', label: 'Venn Diagram' },
  { key: 'radar_chart', label: 'Radar Chart' },
  { key: 'grid_view', label: 'Grid View' },
  { key: 'article_structure', label: 'Article Structure' },
  { key: 'treemap', label: 'Treemap' },
];

function TextPage() {
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [activeTab, setActiveTab] = useState('article');
  const [groupedByTopics, setGroupedByTopics] = useState(false);
  const [tooltipEnabled, setTooltipEnabled] = useState(true);
  const [highlightedGroupedTopic, setHighlightedGroupedTopic] = useState(null);
  useEffect(() => {
    if (highlightedGroupedTopic && !selectedTopics.some(t => t.name === highlightedGroupedTopic)) {
      setHighlightedGroupedTopic(null);
    }
  }, [selectedTopics, highlightedGroupedTopic]);
  const [summaryModalTopic, setSummaryModalTopic] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [panelTopic, setPanelTopic] = useState(null);
  const [fullscreenGraph, setFullscreenGraph] = useState(null);
  const [highlightAllTopics, setHighlightAllTopics] = useState(false);

  const toggleHighlightAll = useCallback(() => {
    setHighlightAllTopics(prev => !prev);
  }, []);

  const closeFullscreenGraph = useCallback(() => {
    setFullscreenGraph(null);
    setActiveTab('article');
  }, []);

  const handleTabClick = useCallback((tabKey) => {
    const isFullscreen = FULLSCREEN_TABS.some(t => t.key === tabKey);
    setActiveTab(tabKey);
    setFullscreenGraph(isFullscreen ? tabKey : null);
  }, []);

  const submissionId = window.location.pathname.split('/')[3];

  const {
    submission,
    loading,
    error,
    fetchSubmission,
    readTopics,
    toggleRead,
    toggleReadAll: toggleReadAllBase,
  } = useSubmission(submissionId);

  const { selectionData } = useTextSelection();

  const {
    safeTopics: _safeTopics,
    rawText: _rawText,
    articleSummaryText,
    articleSummaryBullets,
    topicSummaryParaMap: _topicSummaryParaMap,
    allTopics,
    rawTextHighlightRanges,
    rawTextFadeRanges,
    highlightedSummaryParas,
    articles,
    insights,
    summaryTimelineItems,
    articleBulletMatches,
    articleTextMatches,
  } = useTextPageData(submission, selectedTopics, hoveredTopic, readTopics);

  const readProgressInfo = useMemo(() => {
    let total_count = 0;
    const read_indices = new Set();
    articles.forEach((article, aIdx) => {
      total_count += (article.sentences || []).length;
      (article.topics || []).forEach(topic => {
        if (readTopics.has(topic.name)) {
          (topic.sentences || []).forEach(idx => read_indices.add(`${aIdx}-${idx}`));
        }
      });
    });
    return { read_count: read_indices.size, total_count };
  }, [articles, readTopics]);

  const readPercentage = readProgressInfo.total_count > 0 ? (readProgressInfo.read_count / readProgressInfo.total_count) * 100 : 0;

  const { navigateTopicSentence } = useTopicNavigation({
    activeTab,
    rawText: _rawText,
    safeTopics: _safeTopics,
    groupedByTopics,
    selectedTopics,
    topicSummaryParaMap: _topicSummaryParaMap,
    setHighlightedGroupedTopic,
  });

  const toggleTopic = useCallback((topic) => {
    setSelectedTopics(prev => {
      const isCurrentlySelected = prev.some(t => t.name === topic.name);
      if (isCurrentlySelected) {
        setHoveredTopic(null);
      }
      return isCurrentlySelected
        ? prev.filter(t => t.name !== topic.name)
        : [...prev, topic];
    });
  }, []);

  const handleHoverTopic = useCallback((topic) => {
    setHoveredTopic(topic);
  }, []);

  const toggleReadAll = useCallback(() => {
    if (!submission) return;
    const allTopicNames = (submission.results?.topics || [])
      .filter(t => t?.name)
      .map(t => t.name);
    toggleReadAllBase(allTopicNames);
  }, [submission, toggleReadAllBase]);

  const toggleShowPanel = useCallback((topicOrTopics) => {
    const isSameSelection = getTopicSelectionKey(panelTopic) === getTopicSelectionKey(topicOrTopics);

    if (showPanel && isSameSelection) {
      setShowPanel(false);
      setPanelTopic(null);
    } else {
      setShowPanel(true);
      setPanelTopic(topicOrTopics);
    }
  }, [showPanel, panelTopic]);

  const handleSummaryClick = useCallback((mapping, article, topicName) => {
    if (mapping && mapping.source_sentences) {
      setSummaryModalTopic({
        name: topicName || 'Source Sentences',
        displayName: topicName || 'Source Sentences',
        fullPath: topicName || null,
        sentenceIndices: mapping.source_sentences,
        _summarySentence: mapping.summary_sentence,
        _sentences: article.sentences,
      });
    }
  }, []);

  const closeSummaryModal = useCallback(() => {
    setSummaryModalTopic(null);
  }, []);

  const handleShowTopicSentences = useCallback((topic) => {
    setSummaryModalTopic({
      name: topic.name,
      displayName: topic.name,
      fullPath: topic.name,
      sentenceIndices: topic.sentences || [],
      ranges: Array.isArray(topic.ranges) ? topic.ranges : [],
    });
  }, []);

  const pendingShowTopicRef = useRef(null);

  const handleShowInArticle = useCallback((modalTopic) => {
    const topicName = modalTopic.fullPath || modalTopic.displayName;
    const matchedTopic = _safeTopics.find(t => t.name === topicName);
    if (!matchedTopic) return;
    pendingShowTopicRef.current = matchedTopic;
    closeFullscreenGraph();
    setSelectedTopics(prev =>
      prev.some(t => t.name === matchedTopic.name) ? prev : [...prev, matchedTopic]
    );
  }, [_safeTopics, closeFullscreenGraph]);

  useEffect(() => {
    if (!fullscreenGraph && pendingShowTopicRef.current) {
      const topic = pendingShowTopicRef.current;
      pendingShowTopicRef.current = null;
      const timer = setTimeout(() => {
        navigateTopicSentence(topic, 'focus');
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [fullscreenGraph, navigateTopicSentence]);

  const handleOpenVisualization = useCallback(() => {
    handleTabClick('topics');
  }, [handleTabClick]);

  const results = submission?.results || {};
  const safeSentences = useMemo(
    () => (Array.isArray(results.sentences) ? results.sentences : []),
    [results.sentences]
  );
  const safeTopics = _safeTopics;
  const rawText = _rawText;

  // Colored ranges for raw text view (character-position based, one per topic)
  const rawTextColoredRanges = useMemo(() => {
    if (!highlightAllTopics) return [];
    const ranges = [];
    safeTopics.forEach(topic => {
      const color = getTopicHighlightColor(topic.name);
      (Array.isArray(topic.ranges) ? topic.ranges : []).forEach(range => {
        const start = Number(range.start);
        const end = Number(range.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          ranges.push({ start, end, color });
        }
      });
    });
    return ranges;
  }, [highlightAllTopics, safeTopics]);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading submission...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2 style={{ color: 'red' }}>Error: {error}</h2>
      </div>
    );
  }

  if (!submission) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>No submission data</h2>
      </div>
    );
  }

  const { status } = submission;
  const isProcessing = status.overall === 'processing' || status.overall === 'pending';
  return (
    <div className="app">
      <div style={{ flex: '0 0 auto', padding: '5px 5px 0' }}>
        <TextPageActionsPortal>
          <TextPageToolbar
            submissionId={submissionId}
            status={status}
            onRefresh={fetchSubmission}
          />
        </TextPageActionsPortal>

        {articles.length > 0 && (
          <div className="tab-bar">
            <div className="tab-group">
              <span className="tab-group-label">Visualizations</span>
              <div className="tabs">
                {FULLSCREEN_TABS.map(tab => (
                  <button key={tab.key} className={activeTab === tab.key ? 'active' : ''}
                    onClick={() => handleTabClick(tab.key)}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {isProcessing && (
          <div style={{
            padding: '8px 15px',
            background: '#fff3cd',
            borderRadius: '5px',
            margin: '0 0 8px 0',
            textAlign: 'center'
          }}>
            <strong>Processing in progress...</strong> Results will appear as tasks complete.
          </div>
        )}
      </div>

      {articles.length > 0 ? (
          <>
          <div className="container" style={{ padding: '0 5px 5px' }}>
            <div className="left-column">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Topics ({safeTopics.length})</h1>
                <ReadProgress percentage={readPercentage} size={60} label="Topics read" />
              </div>
              <TopicList
                topics={allTopics}
                selectedTopics={selectedTopics}
                hoveredTopic={hoveredTopic}
                onToggleTopic={toggleTopic}
                onHoverTopic={handleHoverTopic}
                readTopics={readTopics}
                onToggleRead={toggleRead}
                showPanel={showPanel}
                panelTopic={panelTopic}
                onToggleShowPanel={toggleShowPanel}
                onNavigateTopic={navigateTopicSentence}
                onToggleReadAll={toggleReadAll}
                onOpenVisualization={handleOpenVisualization}
                highlightAllTopics={highlightAllTopics}
                onToggleHighlightAll={toggleHighlightAll}
              />
            </div>
            <div className="right-column">
              <div style={{
                transition: 'opacity 0.25s ease',
                opacity: showPanel && panelTopic ? 1 : 0,
                pointerEvents: showPanel && panelTopic ? 'auto' : 'none',
              }}>
                {panelTopic && (
                  <TopicSentencePanel
                    panelTopic={panelTopic}
                    articles={articles}
                    onClose={() => toggleShowPanel(panelTopic)}
                  />
                )}
              </div>
              <div className="article-section">
                <ArticleTabHeader
                  activeTab={activeTab}
                  onTabClick={handleTabClick}
                  groupedByTopics={groupedByTopics}
                  onToggleGrouped={() => setGroupedByTopics(prev => !prev)}
                  tooltipEnabled={tooltipEnabled}
                  onToggleTooltip={() => setTooltipEnabled(prev => !prev)}
                  sourceUrl={submission.source_url}
                />

                <div className="article-body">
                  {activeTab === 'article_summary' ? (
                    <ArticleSummaryView
                      articleSummaryText={articleSummaryText}
                      articleSummaryBullets={articleSummaryBullets}
                      articleBulletMatches={articleBulletMatches}
                      articleTextMatches={articleTextMatches}
                      selectedTopics={selectedTopics}
                      onToggleTopic={toggleTopic}
                      onShowTopicSentences={handleShowTopicSentences}
                    />
                  ) : activeTab === 'markup' ? (
                    <ArticleMarkupView
                      safeSentences={safeSentences}
                      safeTopics={safeTopics}
                      markup={submission?.results?.markup}
                      selectedTopics={selectedTopics}
                      readTopics={readTopics}
                      onToggleRead={toggleRead}
                      onToggleTopic={toggleTopic}
                      onNavigateTopic={navigateTopicSentence}
                      onShowSentences={handleShowTopicSentences}
                      tooltipEnabled={tooltipEnabled}
                      coloredHighlightMode={highlightAllTopics}
                    />
                  ) : groupedByTopics ? (
                    <GroupedByTopicsView
                      topics={safeTopics}
                      rawHtml={articles[0]?.raw_html || ''}
                      sentences={articles[0]?.sentences || []}
                      isRawTextMode={activeTab === 'raw_text'}
                      highlightedTopicName={highlightedGroupedTopic}
                    />
                  ) : activeTab === 'raw_text' ? (
                    <RawTextView
                      rawText={rawText}
                      submissionId={submissionId}
                      sourceUrl={submission.source_url}
                      highlightRanges={rawTextHighlightRanges}
                      fadeRanges={rawTextFadeRanges}
                      coloredRanges={rawTextColoredRanges}
                    />
                  ) : (
                    articles.map((article, index) => (
                      article.sentences.length === 0 ? (
                        <div
                          key={index}
                          className="article-section"
                          dangerouslySetInnerHTML={{ __html: (() => { const m = article.raw_html.match(/<body[^>]*>([\s\S]*?)<\/body>/i); return m ? m[1] : article.raw_html; })() }}
                        />
                      ) : (
                        <TextDisplay
                          key={index}
                          sentences={article.sentences}
                          selectedTopics={selectedTopics}
                          hoveredTopic={hoveredTopic}
                          readTopics={readTopics}
                          articleTopics={article.topics}
                          articleIndex={index}
                          topicSummaries={article.topic_summaries}
                          paragraphMap={article.paragraph_map}
                          rawHtml={article.raw_html}
                          markerWordIndices={article.marker_word_indices}
                          onToggleRead={toggleRead}
                          onToggleTopic={toggleTopic}
                          onNavigateTopic={navigateTopicSentence}
                          onShowSentences={handleShowTopicSentences}
                          tooltipEnabled={tooltipEnabled}
                          submissionId={submissionId}
                          coloredHighlightMode={highlightAllTopics}
                        />
                      )
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {fullscreenGraph === 'topic_summary_timeline' && (
            <SummaryTimeline
              mode="summary"
              title="Topic Summaries"
              summaryTimelineItems={summaryTimelineItems}
              highlightedSummaryParas={highlightedSummaryParas}
              summaryModalTopic={summaryModalTopic}
              closeSummaryModal={closeSummaryModal}
              handleSummaryClick={handleSummaryClick}
              articles={articles}
              onClose={closeFullscreenGraph}
              onShowInArticle={handleShowInArticle}
              readTopics={readTopics}
              onToggleRead={toggleRead}
              markup={submission?.results?.markup}
            />
          )}

          {fullscreenGraph === 'insights' && (
            <SummaryTimeline
              mode="insights"
              title="Insights"
              insights={insights}
              sentences={safeSentences}
              highlightedSummaryParas={new Set()}
              summaryModalTopic={null}
              closeSummaryModal={closeSummaryModal}
              handleSummaryClick={handleSummaryClick}
              articles={articles}
              onClose={closeFullscreenGraph}
              onShowInArticle={handleShowInArticle}
              readTopics={readTopics}
              onToggleRead={toggleRead}
              markup={submission?.results?.markup}
            />
          )}

          <VisualizationPanels
            fullscreenGraph={fullscreenGraph}
            onClose={closeFullscreenGraph}
            safeTopics={safeTopics}
            safeSentences={safeSentences}
            results={results}
            submissionId={submissionId}
            allTopics={allTopics}
            onShowInArticle={handleShowInArticle}
            readTopics={readTopics}
            onToggleRead={toggleRead}
            markup={submission?.results?.markup}
          />
        </>) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            <p>No results yet. Processing is in progress...</p>
          </div>
        )}

      {!fullscreenGraph && summaryModalTopic && (
        <TopicSentencesModal
          topic={summaryModalTopic}
          sentences={summaryModalTopic._sentences || safeSentences}
          onClose={closeSummaryModal}
          markup={submission?.results?.markup}
          readTopics={readTopics}
          onToggleRead={toggleRead}
        />
      )}

      <WordSelectionPopup selectionData={selectionData} submissionId={submissionId} />
    </div>
  );
}

export default TextPage;
