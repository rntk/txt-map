import React, { useState, useEffect } from 'react';
import TopicList from './TopicList';
import TextDisplay from './TextDisplay';
import TopicsRiverChart from './TopicsRiverChart';
import SubtopicsRiverChart from './SubtopicsRiverChart';
import MindmapResults from './MindmapResults';
import InsidesResults from './InsidesResults';
import '../styles/App.css';

function StatusIndicator({ tasks }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#4caf50';
      case 'processing': return '#2196f3';
      case 'failed': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✓';
      case 'processing': return '⟳';
      case 'failed': return '✗';
      default: return '○';
    }
  };

  return (
    <div style={{
      padding: '15px',
      background: '#f5f5f5',
      borderRadius: '5px',
      marginBottom: '20px'
    }}>
      <h3 style={{ margin: '0 0 10px 0' }}>Processing Status</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
        {Object.entries(tasks).map(([taskName, taskInfo]) => (
          <div key={taskName} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px',
            background: 'white',
            borderRadius: '4px'
          }}>
            <span style={{
              marginRight: '8px',
              fontSize: '18px',
              color: getStatusColor(taskInfo.status)
            }}>
              {getStatusIcon(taskInfo.status)}
            </span>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '12px', textTransform: 'capitalize' }}>
                {taskName.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                {taskInfo.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RefreshButton({ submissionId, onRefresh }) {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/api/submission/${submissionId}/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks: ['all'] })
        }
      );

      if (response.ok) {
        if (onRefresh) onRefresh();
      } else {
        console.error('Refresh failed:', await response.text());
      }
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      style={{
        padding: '10px 20px',
        background: loading ? '#ccc' : '#2196f3',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: 'bold'
      }}
    >
      {loading ? 'Refreshing...' : '🔄 Refresh Results'}
    </button>
  );
}

function TextPage() {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('article'); // 'article' | 'summary' | 'topics_river' | 'mindmap' | 'insides'
  const [summaryModalData, setSummaryModalData] = useState(null); // For modal window
  const [readTopics, setReadTopics] = useState(new Set());

  const submissionId = window.location.pathname.split('/')[3];

  const fetchSubmission = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/submission/${submissionId}`);

      if (!response.ok) {
        throw new Error('Submission not found');
      }

      const data = await response.json();
      setSubmission(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmission();

    // Poll for status updates while processing
    const interval = setInterval(async () => {
      if (!submissionId) return;

      try {
        const response = await fetch(`http://127.0.0.1:8000/api/submission/${submissionId}/status`);
        if (response.ok) {
          const data = await response.json();

          // Update submission with new status
          setSubmission(prev => prev ? { ...prev, status: { tasks: data.tasks, overall: data.overall_status } } : null);

          // Stop polling if all tasks are completed or failed
          if (data.overall_status === 'completed' || data.overall_status === 'failed') {
            clearInterval(interval);
            fetchSubmission(); // Fetch full results
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [submissionId]);

  const toggleTopic = (topic) => {
    setSelectedTopics(prev => {
      const isCurrentlySelected = prev.some(t => t.name === topic.name);
      // Always clear hover state when deselecting a topic
      if (isCurrentlySelected) {
        setHoveredTopic(null);
      }
      return isCurrentlySelected
        ? prev.filter(t => t.name !== topic.name)
        : [...prev, topic];
    });
  };

  const handleHoverTopic = (topic) => {
    setHoveredTopic(topic);
  };

  const toggleRead = (topic) => {
    setReadTopics(prev => {
      const newSet = new Set(prev);
      const topicName = topic.name;
      if (newSet.has(topicName)) {
        newSet.delete(topicName);
      } else {
        newSet.add(topicName);
      }
      return newSet;
    });
  };

  const handleSummaryClick = (mapping, article) => {
    if (mapping && mapping.source_sentences) {
      setSummaryModalData({
        sentences: mapping.source_sentences.map(idx => article.sentences[idx - 1]),
        summarySentence: mapping.summary_sentence
      });
    }
  };

  const closeSummaryModal = () => {
    setSummaryModalData(null);
  };

  const runRefresh = async (tasks, successMessage) => {
    setActionMessage('');
    setActionLoading(true);
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/api/submission/${submissionId}/refresh`,
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
        `http://127.0.0.1:8000/api/submission/${submissionId}`,
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

  const { results, status } = submission;
  const isProcessing = status.overall === 'processing' || status.overall === 'pending';

  // Format data for TopicList and TextDisplay components
  const safeSentences = Array.isArray(results.sentences) ? results.sentences : [];
  const safeTopics = Array.isArray(results.topics) ? results.topics : [];

  const articles = safeSentences.length > 0 ? [{
    sentences: safeSentences,
    topics: safeTopics,
    topic_summaries: results.topic_summaries || {},
    paragraph_map: results.paragraph_map || null,
    raw_html: submission.html_content || '',
    marker_word_indices: Array.isArray(results.marker_word_indices) ? results.marker_word_indices : []
  }] : [];

  const allTopics = safeTopics.map(topic => ({
    ...topic,
    totalSentences: topic.sentences ? topic.sentences.length : 0,
    summary: results.topic_summaries ? results.topic_summaries[topic.name] : ''
  }));

  const rawText = submission.text_content || '';

  return (
    <div className="app">
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1>Text Analysis Results</h1>
            {submission.source_url && (
              <div style={{ fontSize: '12px', color: '#666' }}>
                Source: <a href={submission.source_url} target="_blank" rel="noopener noreferrer">{submission.source_url}</a>
              </div>
            )}
          </div>
          <RefreshButton submissionId={submissionId} onRefresh={fetchSubmission} />
        </div>

        <StatusIndicator tasks={status.tasks} />

        <div className="text-management">
          <div className="text-management-header">
            <h2>Manage Submission</h2>
            <div className="text-management-actions">
              <button
                className="action-btn"
                onClick={() => runRefresh(['all'], 'Recalculation queued for all tasks.')}
                disabled={actionLoading}
              >
                Recalculate All
              </button>
              <button
                className="action-btn"
                onClick={() => runRefresh(['split_topic_generation', 'subtopics_generation', 'summarization', 'mindmap', 'insides'], 'Topic-related tasks queued.')}
                disabled={actionLoading}
              >
                Recalculate Topics
              </button>
              <button
                className="action-btn"
                onClick={() => runRefresh(['summarization'], 'Summarization queued.')}
                disabled={actionLoading}
              >
                Recalculate Summary
              </button>
              <button
                className="action-btn"
                onClick={() => runRefresh(['mindmap'], 'Mindmap queued.')}
                disabled={actionLoading}
              >
                Recalculate Mindmap
              </button>
              <button
                className="action-btn"
                onClick={() => runRefresh(['insides'], 'Insides queued.')}
                disabled={actionLoading}
              >
                Recalculate Insides
              </button>
              <button
                className="action-btn danger"
                onClick={handleDelete}
                disabled={actionLoading}
              >
                Delete Submission
              </button>
            </div>
          </div>
          {actionMessage && <div className="text-management-message">{actionMessage}</div>}
        </div>

        <div className="raw-text-panel">
          <div className="raw-text-header">
            <h2>Raw Text</h2>
            <div className="raw-text-meta">
              {rawText.length.toLocaleString()} characters
            </div>
          </div>
          <pre className="raw-text-content">{rawText || 'No raw text available.'}</pre>
        </div>

        {isProcessing && (
          <div style={{
            padding: '15px',
            background: '#fff3cd',
            borderRadius: '5px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            <strong>Processing in progress...</strong> Results will appear as tasks complete.
          </div>
        )}

        {articles.length > 0 ? (
          <div className="container">
            <div className="left-column">
              <h1>Topics</h1>
              <TopicList
                topics={allTopics}
                selectedTopics={selectedTopics}
                hoveredTopic={hoveredTopic}
                onToggleTopic={toggleTopic}
                onHoverTopic={handleHoverTopic}
                readTopics={readTopics}
                onToggleRead={toggleRead}
              />
            </div>
            <div className="right-column">
              <div className="article-section">
                <div className="article-header">
                  <div className="article-title-section">
                    <h1>Analyzed Text ({safeTopics.length} topics)</h1>
                  </div>
                  <div className="article-controls">
                    <div className="tabs">
                      <button
                        className={activeTab === 'article' ? 'active' : ''}
                        onClick={() => setActiveTab('article')}
                      >
                        Article
                      </button>
                      <button
                        className={activeTab === 'summary' ? 'active' : ''}
                        onClick={() => setActiveTab('summary')}
                      >
                        Summary
                      </button>
                      <button
                        className={activeTab === 'topics_river' ? 'active' : ''}
                        onClick={() => setActiveTab('topics_river')}
                      >
                        Topics River
                      </button>
                      <button
                        className={activeTab === 'mindmap' ? 'active' : ''}
                        onClick={() => setActiveTab('mindmap')}
                      >
                        Mindmap
                      </button>
                      <button
                        className={activeTab === 'insides' ? 'active' : ''}
                        onClick={() => setActiveTab('insides')}
                      >
                        Insides
                      </button>
                    </div>
                  </div>
                </div>

                {activeTab === 'summary' ? (
                  <div className="summary-content">
                    <h2>Summary</h2>
                    <div className="summary-text">
                      {Array.isArray(results.summary) && results.summary.length > 0 ? (
                        results.summary_mappings && results.summary_mappings.length > 0 ? (
                          results.summary.map((summaryText, i) => {
                            const mapping = results.summary_mappings.find(m => m.summary_index === i);
                            return (
                              <div key={i} className="summary-paragraph-wrapper">
                                <p className="summary-paragraph-text">
                                  {summaryText}
                                  {mapping && (
                                    <>
                                      {' '}
                                      <button
                                        className="summary-source-link"
                                        onClick={() => handleSummaryClick(mapping, articles[0])}
                                        title="View source sentences"
                                      >
                                        [source]
                                      </button>
                                    </>
                                  )}
                                </p>
                              </div>
                            );
                          })
                        ) : (
                          results.summary.map((p, i) => (
                            <p key={i}>{p}</p>
                          ))
                        )
                      ) : (
                        <p>No summary available. Processing may still be in progress...</p>
                      )}
                    </div>
                    {summaryModalData && (
                      <div className="summary-modal-overlay" onClick={closeSummaryModal}>
                        <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
                          <div className="modal-header">
                            <h3>Source Sentences</h3>
                            <button className="modal-close" onClick={closeSummaryModal}>×</button>
                          </div>
                          <div className="modal-body">
                            <div className="modal-summary-sentence">
                              <strong>Summary:</strong> {summaryModalData.summarySentence}
                            </div>
                            <div className="modal-divider"></div>
                            <div className="modal-source-sentences">
                              <strong>Original sentences:</strong>
                              {summaryModalData.sentences.map((sent, idx) => (
                                <div key={idx} className="modal-sentence">
                                  <span className="sentence-number">{idx + 1}.</span>
                                  <span className="sentence-text">{sent}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'topics_river' ? (
                  <div className="topics-river-container" style={{ padding: '20px' }}>
                    <div style={{ marginBottom: '60px' }}>
                      <h2>Topics River</h2>
                      <p>Visualization of topic density across the article.</p>
                      <TopicsRiverChart topics={safeTopics} articleLength={safeSentences.length} />
                    </div>
                    <div className="subtopics-river-section">
                      <h2>Subtopics River</h2>
                      <p>Visualization of subtopics for each chapter. X axis: Global sentence index. Y axis: Chapters.</p>
                      {results.subtopics ? (
                        <SubtopicsRiverChart
                          topics={safeTopics}
                          subtopics={results.subtopics}
                          articleLength={safeSentences.length}
                        />
                      ) : (
                        <p style={{ fontStyle: 'italic', color: '#666' }}>No subtopics data available.</p>
                      )}
                    </div>
                  </div>
                ) : activeTab === 'mindmap' ? (
                  <div className="mindmap-tab-container" style={{ padding: '20px' }}>
                    <MindmapResults
                      mindmapData={{
                        topic_mindmaps: results.topic_mindmaps || {},
                        sentences: safeSentences,
                        mindmap_results: results.mindmap_results || [],
                        mindmap_metadata: results.mindmap_metadata || {}
                      }}
                      insidesData={results.insides || []}
                    />
                  </div>
                ) : activeTab === 'insides' ? (
                  <div className="insides-tab-container" style={{ padding: '20px' }}>
                    <InsidesResults
                      insidesData={{
                        insides: results.insides || []
                      }}
                    />
                  </div>
                ) : (
                  articles.map((article, index) => (
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
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            <p>No results yet. Processing is in progress...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TextPage;
