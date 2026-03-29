import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import TopicList from './TopicList';
import TextDisplay from './TextDisplay';
import ReadProgress from './ReadProgress';
import GroupedByTopicsView from './GroupedByTopicsView';
import TopicSentencesModal from './shared/TopicSentencesModal';
import DropdownMenu from './shared/DropdownMenu';
import StatusIndicator from './shared/StatusIndicator';
import RawTextDisplay from './shared/RawTextDisplay';
import RefreshButton from './shared/RefreshButton';
import TextPageActionsPortal from './TextPageActionsPortal';
import VisualizationPanels from './VisualizationPanels';
import SummaryTimeline from './SummaryTimeline';
import SummarySourceMenu from './SummarySourceMenu';
import TopicSentencePanel from './TopicSentencePanel';
import MarkupRenderer from './markup/MarkupRenderer';
import {
  buildEnrichedRangeGroupsWithFallbacks,
  buildGroupMarkup,
  resolveTopicMarkup,
} from './markup/topicMarkupUtils';
import { useSubmission } from '../hooks/useSubmission';
import { useTopicNavigation } from '../hooks/useTopicNavigation';
import { useTextSelection } from '../hooks/useTextSelection';
import { getTopicSelectionKey } from '../utils/chartConstants';
import { useTextPageData } from '../hooks/useTextPageData';
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
  { key: 'radar_chart', label: 'Radar Chart' },
  { key: 'grid_view', label: 'Grid View' },
  { key: 'article_structure', label: 'Article Structure' },
  { key: 'treemap', label: 'Treemap' },
];

function hasNonPlainMarkup(topicMarkup) {
  return Boolean(
    topicMarkup
    && Array.isArray(topicMarkup.segments)
    && topicMarkup.segments.some(segment => segment?.type !== 'plain')
  );
}

function buildArticleMarkupBlocks(sentences, topics, markup) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  const safeTopics = Array.isArray(topics) ? topics : [];
  const totalSentences = safeSentences.length;

  if (totalSentences === 0) {
    return [];
  }

  const candidateBlocks = [];

  safeTopics.forEach((topic, topicIndex) => {
    const topicMarkup = resolveTopicMarkup(markup, topic);
    if (!hasNonPlainMarkup(topicMarkup)) {
      return;
    }

    const rangeGroups = buildEnrichedRangeGroupsWithFallbacks(
      Array.isArray(topicMarkup?.positions) ? topicMarkup.positions : [],
      Array.isArray(topic?.sentences) ? topic.sentences : [],
      Array.isArray(topic?.ranges) ? topic.ranges : []
    );

    rangeGroups.forEach((rangeGroup, rangeIndex) => {
      if (!Number.isInteger(rangeGroup?.firstSourceSentenceIndex) || !Number.isInteger(rangeGroup?.lastSourceSentenceIndex)) {
        return;
      }

      const groupMarkup = buildGroupMarkup(topicMarkup, rangeGroup);
      if (!hasNonPlainMarkup(groupMarkup)) {
        return;
      }

      candidateBlocks.push({
        kind: 'markup',
        key: `${topic?.name || 'topic'}-${topicIndex}-${rangeIndex}-${rangeGroup.firstSourceSentenceIndex}-${rangeGroup.lastSourceSentenceIndex}`,
        startSentenceIndex: rangeGroup.firstSourceSentenceIndex,
        endSentenceIndex: rangeGroup.lastSourceSentenceIndex,
        sentences: groupMarkup.positions.map((position) => position.text || ''),
        segments: groupMarkup.segments,
      });
    });
  });

  candidateBlocks.sort((left, right) => {
    if (left.startSentenceIndex !== right.startSentenceIndex) {
      return left.startSentenceIndex - right.startSentenceIndex;
    }
    return left.endSentenceIndex - right.endSentenceIndex;
  });

  const blocks = [];
  let cursor = 1;

  const pushPlainBlock = (startSentenceIndex, endSentenceIndex) => {
    if (startSentenceIndex > endSentenceIndex) {
      return;
    }

    blocks.push({
      kind: 'plain',
      key: `plain-${startSentenceIndex}-${endSentenceIndex}`,
      startSentenceIndex,
      endSentenceIndex,
      sentences: safeSentences.slice(startSentenceIndex - 1, endSentenceIndex),
    });
  };

  candidateBlocks.forEach((block) => {
    const startSentenceIndex = Math.max(1, block.startSentenceIndex);
    const endSentenceIndex = Math.min(totalSentences, block.endSentenceIndex);

    if (startSentenceIndex > endSentenceIndex) {
      return;
    }

    if (startSentenceIndex < cursor) {
      return;
    }

    if (cursor < startSentenceIndex) {
      pushPlainBlock(cursor, startSentenceIndex - 1);
    }

    blocks.push({
      ...block,
      startSentenceIndex,
      endSentenceIndex,
    });
    cursor = endSentenceIndex + 1;
  });

  if (cursor <= totalSentences) {
    pushPlainBlock(cursor, totalSentences);
  }

  return blocks;
}

function ArticleMarkupPlainBlock({ sentences, startSentenceIndex }) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];

  return (
    <div className="markup-segment">
      {safeSentences.map((sentence, index) => (
        <div key={`${startSentenceIndex + index}-${sentence}`} className="markup-plain__sentence">
          <span className="markup-plain__num">{startSentenceIndex + index}.</span>
          <span>{sentence}</span>
        </div>
      ))}
    </div>
  );
}


function TextPage() {
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
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

  const highlightedBulletIndices = useMemo(() => {
    if (!selectedTopics.length || !articleBulletMatches.length) return new Set();
    const selectedNames = new Set(selectedTopics.map(t => t.name));
    const result = new Set();
    articleBulletMatches.forEach((matches, idx) => {
      if (matches.some(m => selectedNames.has(m.topic.name))) result.add(idx);
    });
    return result;
  }, [selectedTopics, articleBulletMatches]);

  const handleOpenVisualization = useCallback(() => {
    handleTabClick('topics');
  }, [handleTabClick]);

  const [bulletSourceMenu, setBulletSourceMenu] = useState(null);

  const handleBulletSourceClick = useCallback((e, index) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setBulletSourceMenu({ bulletIndex: index, x: rect.left, y: rect.bottom + 4 });
  }, []);

  const handleTextSourceClick = useCallback((e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setBulletSourceMenu({ bulletIndex: -1, x: rect.left, y: rect.bottom + 4 });
  }, []);

  const handleBulletTopicSelect = useCallback((topic, sentenceIndices) => {
    setBulletSourceMenu(null);
    setSummaryModalTopic({
      name: topic.name,
      displayName: topic.name,
      fullPath: topic.name,
      sentenceIndices,
      ranges: Array.isArray(topic.ranges) ? topic.ranges : [],
    });
  }, []);

  const results = submission?.results || {};
  const safeSentences = useMemo(
    () => (Array.isArray(results.sentences) ? results.sentences : []),
    [results.sentences]
  );
  const safeTopics = _safeTopics;
  const rawText = _rawText;
  const articleMarkupBlocks = useMemo(
    () => buildArticleMarkupBlocks(safeSentences, safeTopics, submission?.results?.markup),
    [safeSentences, safeTopics, submission?.results?.markup]
  );

  const runRefresh = async (tasks, successMessage) => {
    setActionMessage('');
    setActionLoading(true);
    try {
      const response = await fetch(
        `/api/submission/${submissionId}/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks })
        }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setActionMessage(successMessage);
      fetchSubmission();
    } catch (err) {
      setActionMessage(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this submission and all its queued tasks? This cannot be undone.')) {
      return;
    }
    setActionMessage('');
    setActionLoading(true);
    try {
      const response = await fetch(
        `/api/submission/${submissionId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setActionMessage('Submission deleted.');
      window.location.href = '/page/topics';
    } catch (err) {
      setActionMessage(`Delete failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

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
          <DropdownMenu buttonContent={<span>Status</span>}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }}>Task Status</div>
            <StatusIndicator tasks={status.tasks} />
          </DropdownMenu>

          <DropdownMenu buttonContent={<><span style={{ fontSize: '14px', lineHeight: 1 }}>☰</span> Menu</>}>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#666' }}>Recalculate</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['all'], 'Recalculation queued for all tasks.')} disabled={actionLoading}>All</button>
              <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['split_topic_generation', 'subtopics_generation', 'summarization', 'mindmap', 'insights_generation'], 'Topic-related tasks queued.')} disabled={actionLoading}>Topics</button>
              <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['summarization'], 'Summarization queued.')} disabled={actionLoading}>Summary</button>
              <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['mindmap'], 'Mindmap queued.')} disabled={actionLoading}>Mindmap</button>
              <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['prefix_tree'], 'Prefix tree queued.')} disabled={actionLoading}>Prefix Tree</button>
              <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['insights_generation'], 'Insights queued.')} disabled={actionLoading}>Insights</button>
              <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['markup_generation'], 'Markup generation queued.')} disabled={actionLoading}>Markup</button>
            </div>

            <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #eee' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <RefreshButton submissionId={submissionId} onRefresh={fetchSubmission} compact={false} />
              <button
                className="action-btn danger"
                onClick={handleDelete}
                disabled={actionLoading}
                style={{ padding: '6px 10px', fontSize: '12px', textAlign: 'center' }}
              >
                Delete
              </button>
            </div>
            {actionMessage && <div style={{ marginTop: '4px', fontSize: '11px', color: '#666', background: '#f5f5f5', padding: '4px', borderRadius: '4px' }}>{actionMessage}</div>}
          </DropdownMenu>
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
            <div className="article-header-sticky">
              <div className="global-menu-links">
                <button
                  className={`global-menu-link${activeTab === 'article' ? ' active' : ''}`}
                  onClick={() => handleTabClick('article')}
                >
                  Article
                </button>
                <button
                  className={`global-menu-link${activeTab === 'article_summary' ? ' active' : ''}`}
                  onClick={() => handleTabClick('article_summary')}
                >
                  Summary
                </button>
                <button
                  className={`global-menu-link${activeTab === 'raw_text' ? ' active' : ''}`}
                  onClick={() => handleTabClick('raw_text')}
                >
                  Raw Text
                </button>
                <button
                  className={`global-menu-link${activeTab === 'markup' ? ' active' : ''}`}
                  onClick={() => handleTabClick('markup')}
                >
                  Markup
                </button>
              </div>
              {(activeTab === 'article' || activeTab === 'raw_text') && (
                <>
                  <label className="grouped-topics-toggle">
                    <input
                      type="checkbox"
                      checked={groupedByTopics}
                      onChange={() => setGroupedByTopics(prev => !prev)}
                    />
                    Grouped by topics
                  </label>
                  <label className="grouped-topics-toggle" style={{ marginLeft: '12px' }}>
                    <input
                      type="checkbox"
                      checked={tooltipEnabled}
                      onChange={() => setTooltipEnabled(prev => !prev)}
                    />
                    Show tooltips
                  </label>
                </>
              )}
              {submission.source_url && (
                <div style={{ fontSize: '11px', color: '#666' }}>
                  Source: <a href={submission.source_url} target="_blank" rel="noopener noreferrer">{submission.source_url}</a>
                </div>
              )}
            </div>

            <div className="article-body">
              {activeTab === 'article_summary' ? (
                <div className="summary-content">
                  {articleSummaryText || articleSummaryBullets.length > 0 ? (
                    <>
                      {articleSummaryText && (
                        <div className="summary-text">
                          <p>
                            {articleSummaryText}
                            {articleTextMatches.length > 0 && (
                              <>
                                {' '}
                                <button
                                  className="summary-source-link"
                                  onClick={handleTextSourceClick}
                                >
                                  [source]
                                </button>
                              </>
                            )}
                          </p>
                        </div>
                      )}
                      {articleSummaryBullets.length > 0 && (
                        <div className="summary-text">
                          <ul>
                            {articleSummaryBullets.map((bullet, index) => {
                              const isHighlighted = highlightedBulletIndices.has(index);
                              const topicBadges = articleBulletMatches[index] || [];
                              return (
                                <li
                                  key={`${index}-${bullet}`}
                                  style={isHighlighted ? { background: '#fffde7', borderRadius: '3px', padding: '2px 4px', marginLeft: '-4px' } : undefined}
                                >
                                  {bullet}
                                  {topicBadges.slice(0, 3).map(({ topic }) => (
                                    <button
                                      key={topic.name}
                                      className="summary-topic-badge"
                                      onClick={() => toggleTopic(topic)}
                                      title={`Select topic: ${topic.name}`}
                                    >
                                      {topic.name.split('/').pop()}
                                    </button>
                                  ))}
                                  {articleBulletMatches[index]?.length > 0 && (
                                    <>
                                      {' '}
                                      <button
                                        className="summary-source-link"
                                        onClick={(e) => handleBulletSourceClick(e, index)}
                                      >
                                        [source]
                                      </button>
                                    </>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <p>No summary available. Processing may still be in progress...</p>
                  )}
                </div>
              ) : activeTab === 'markup' ? (
                <div className="summary-content">
                  <div className="markup-content">
                    {articleMarkupBlocks.map((block) => (
                      block.kind === 'markup' ? (
                        <MarkupRenderer
                          key={block.key}
                          segments={block.segments}
                          sentences={block.sentences}
                        />
                      ) : (
                        <ArticleMarkupPlainBlock
                          key={block.key}
                          sentences={block.sentences}
                          startSentenceIndex={block.startSentenceIndex}
                        />
                      )
                    ))}
                  </div>
                </div>
              ) : groupedByTopics ? (
                <GroupedByTopicsView
                  topics={safeTopics}
                  rawHtml={articles[0]?.raw_html || ''}
                  sentences={articles[0]?.sentences || []}
                  isRawTextMode={activeTab === 'raw_text'}
                  highlightedTopicName={highlightedGroupedTopic}
                />
              ) : activeTab === 'raw_text' ? (
                <div className="summary-content">
                  <div className="raw-text-meta" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{rawText.length.toLocaleString()} characters</span>
                    <button
                      className="action-btn"
                      style={{ padding: '2px 8px', fontSize: '11px' }}
                      onClick={() => navigator.clipboard.writeText(rawText)}
                    >
                      Copy
                    </button>
                    <a
                      className="action-btn"
                      style={{ padding: '2px 8px', fontSize: '11px', textDecoration: 'none', verticalAlign: 'middle' }}
                      href={URL.createObjectURL(new Blob([rawText], { type: 'text/plain' }))}
                      download={`${submission.source_url || submissionId}.txt`}
                    >
                      Download
                    </a>
                  </div>
                  <RawTextDisplay
                    rawText={rawText}
                    articleIndex={0}
                    highlightRanges={rawTextHighlightRanges}
                    fadeRanges={rawTextFadeRanges}
                  />
                </div>
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

      {bulletSourceMenu && (
        <SummarySourceMenu
          matches={
            bulletSourceMenu.bulletIndex === -1
              ? articleTextMatches
              : (articleBulletMatches[bulletSourceMenu.bulletIndex] || [])
          }
          onSelect={handleBulletTopicSelect}
          onClose={() => setBulletSourceMenu(null)}
          x={bulletSourceMenu.x}
          y={bulletSourceMenu.y}
        />
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

      {selectionData && (
        <div style={{
          position: 'fixed',
          left: selectionData.position.x,
          top: selectionData.position.y,
          transform: 'translate(-50%, -100%)',
          zIndex: 1000,
          background: '#1976d2',
          padding: '4px 8px',
          borderRadius: '4px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
        }}>
          <button 
            style={{ color: '#fff', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = `/page/word/${submissionId}/${encodeURIComponent(selectionData.word)}`;
            }}
          >
            Explore Word: "{selectionData.word}"
          </button>
        </div>
      )}
    </div>
  );
}

export default TextPage;
