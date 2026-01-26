import React, { useState, useEffect } from 'react';
import TopicList from './TopicList';
import TextDisplay from './TextDisplay';
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
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  const handleHoverTopic = (topic) => {
    setHoveredTopic(topic);
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
  const articles = results.sentences.length > 0 ? [{
    sentences: results.sentences,
    topics: results.topics || [],
    topic_summaries: results.topic_summaries || {}
  }] : [];

  const allTopics = results.topics ? results.topics.map(topic => ({
    ...topic,
    totalSentences: topic.sentences ? topic.sentences.length : 0,
    summary: results.topic_summaries ? results.topic_summaries[topic.name] : ''
  })) : [];

  return (
    <div className="App">
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1>Text Analysis Results</h1>
          <RefreshButton submissionId={submissionId} onRefresh={fetchSubmission} />
        </div>

        <StatusIndicator tasks={status.tasks} />

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
            <TopicList
              allTopics={allTopics}
              selectedTopics={selectedTopics}
              hoveredTopic={hoveredTopic}
              onToggleTopic={toggleTopic}
              onHoverTopic={handleHoverTopic}
              readTopics={new Set()}
              onToggleRead={() => {}}
            />
            <TextDisplay
              articles={articles}
              selectedTopics={selectedTopics}
              hoveredTopic={hoveredTopic}
              readArticles={new Set()}
              onToggleReadArticle={() => {}}
            />
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
