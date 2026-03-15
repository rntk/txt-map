import React, { useState, useEffect, useCallback, useRef } from 'react';
import TopicList from './TopicList';
import TextDisplay from './TextDisplay';
import TopicsRiverChart from './TopicsRiverChart';
import SubtopicsRiverChart from './SubtopicsRiverChart';
import MarimekkoChartTab from './MarimekkoChartTab';
import MindmapResults from './MindmapResults';
import PrefixTreeResults from './PrefixTreeResults';
import FullScreenGraph from './FullScreenGraph';
import TopicsTagCloud from './TopicsTagCloud';
import CircularPackingChart from './CircularPackingChart';
import GridView from './GridView';
import TopicsBarChart from './TopicsBarChart';
import RadarChart from './RadarChart';
import ArticleStructureChart from './ArticleStructureChart';
import { buildSummaryTimelineItems } from '../utils/summaryTimeline';
import '../styles/App.css';

const SIDEBAR_TABS = [
  { key: 'article', label: 'Article' },
  { key: 'summary', label: 'Summary' },
  { key: 'raw_text', label: 'Raw Text' },
];

const FULLSCREEN_TABS = [
  { key: 'topics', label: 'Topics' },
  { key: 'topics_river', label: 'Topics River' },
  { key: 'marimekko', label: 'Marimekko' },
  { key: 'mindmap', label: '🧠 Mindmap' },
  { key: 'prefix_tree', label: '🌳 Prefix Tree' },
  { key: 'tags_cloud', label: '☁️ Tags Cloud' },
  { key: 'circular_packing', label: '⬤ Circles' },
  { key: 'radar_chart', label: 'Radar Chart' },
  { key: 'grid_view', label: 'Grid View' },
  { key: 'article_structure', label: 'Article Structure' },
];

function normalizeCharRange(range, textLength) {
  const start = Number(range?.start);
  const end = Number(range?.end);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  const clampedStart = Math.max(0, Math.min(textLength, start));
  const clampedEnd = Math.max(0, Math.min(textLength, end));

  if (clampedEnd <= clampedStart) {
    return null;
  }

  return { start: clampedStart, end: clampedEnd };
}

function buildTopicStateRanges(topics, selectedTopics, hoveredTopic, readTopics, textLength) {
  const highlightRanges = [];
  const fadeRanges = [];
  const selectedNames = new Set((Array.isArray(selectedTopics) ? selectedTopics : []).map((topic) => topic?.name));
  const hoveredName = hoveredTopic?.name || null;
  const readNames = readTopics instanceof Set ? readTopics : new Set(readTopics || []);

  (Array.isArray(topics) ? topics : []).forEach((topic) => {
    const topicName = topic?.name;
    const ranges = Array.isArray(topic?.ranges) ? topic.ranges : [];
    if (!topicName || ranges.length === 0) {
      return;
    }

    const isHighlighted = selectedNames.has(topicName) || hoveredName === topicName;
    const isFaded = readNames.has(topicName);

    ranges.forEach((range) => {
      const normalizedRange = normalizeCharRange(range, textLength);
      if (!normalizedRange) {
        return;
      }

      if (isHighlighted) {
        highlightRanges.push(normalizedRange);
      } else if (isFaded) {
        fadeRanges.push(normalizedRange);
      }
    });
  });

  return { highlightRanges, fadeRanges };
}

function buildRawTextSegments(rawText, highlightRanges, fadeRanges) {
  if (!rawText) {
    return [];
  }

  const boundaries = new Set([0, rawText.length]);
  [...highlightRanges, ...fadeRanges].forEach((range) => {
    boundaries.add(range.start);
    boundaries.add(range.end);
  });

  const sortedBoundaries = Array.from(boundaries)
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= rawText.length)
    .sort((a, b) => a - b);

  const overlapsRange = (start, end, ranges) => ranges.some((range) => start < range.end && end > range.start);
  const segments = [];

  for (let i = 0; i < sortedBoundaries.length - 1; i += 1) {
    const start = sortedBoundaries[i];
    const end = sortedBoundaries[i + 1];

    if (end <= start) {
      continue;
    }

    let state = null;
    if (overlapsRange(start, end, highlightRanges)) {
      state = 'highlighted';
    } else if (overlapsRange(start, end, fadeRanges)) {
      state = 'faded';
    }

    const text = rawText.slice(start, end);
    if (!text) {
      continue;
    }

    const previous = segments[segments.length - 1];
    if (previous && previous.state === state && previous.end === start) {
      previous.text += text;
      previous.end = end;
      continue;
    }

    segments.push({ start, end, text, state });
  }

  return segments;
}

function RawTextDisplay({ rawText, articleIndex, highlightRanges, fadeRanges }) {
  if (!rawText) {
    return (
      <pre className="raw-text-content raw-text-content-page">No raw text available.</pre>
    );
  }

  const segments = buildRawTextSegments(rawText, highlightRanges, fadeRanges);

  return (
    <pre className="raw-text-content raw-text-content-page">
      {segments.map((segment) => (
        segment.state ? (
          <span
            key={`${segment.start}-${segment.end}-${segment.state}`}
            className={`raw-text-token ${segment.state}`}
            data-article-index={articleIndex}
            data-char-start={segment.start}
            data-char-end={segment.end}
          >
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={`${segment.start}-${segment.end}-plain`}>
            {segment.text}
          </React.Fragment>
        )
      ))}
    </pre>
  );
}

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
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      alignItems: 'center'
    }}>
      {Object.entries(tasks).map(([taskName, taskInfo]) => (
        <div key={taskName} style={{
          display: 'flex',
          alignItems: 'center',
          padding: '1px 6px',
          background: 'white',
          borderRadius: '4px',
          border: '1px solid #eee',
          fontSize: '11px',
          whiteSpace: 'nowrap'
        }} title={`${taskName.replace(/_/g, ' ')}: ${taskInfo.status}`}>
          <span style={{
            marginRight: '4px',
            fontWeight: 'bold',
            color: getStatusColor(taskInfo.status)
          }}>
            {getStatusIcon(taskInfo.status)}
          </span>
          <span style={{ color: '#444', textTransform: 'capitalize' }}>
            {taskName.replace(/_/g, ' ')}
          </span>
        </div>
      ))}
    </div>
  );
}

function RefreshButton({ submissionId, onRefresh, compact = false }) {
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
      className="action-btn"
      style={{
        background: loading ? '#ccc' : '#2196f3',
        color: 'white',
        border: 'none',
        padding: compact ? '4px 8px' : '8px 16px',
        fontSize: compact ? '12px' : '13px'
      }}
    >
      {loading ? '...' : '🔄 Refresh'}
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
  const [activeTab, setActiveTab] = useState('article'); // 'article' | 'summary' | 'raw_text' | 'topics_river' | 'mindmap'
  const [summaryModalData, setSummaryModalData] = useState(null); // For modal window
  const [readTopics, setReadTopics] = useState(new Set());
  const hasLoadedRef = useRef(false);
  const lastSyncedRef = useRef('');
  const pendingSaveRef = useRef(null);
  const [showPanel, setShowPanel] = useState(false);
  const [panelTopic, setPanelTopic] = useState(null);
  const [fullscreenGraph, setFullscreenGraph] = useState(null); // 'mindmap' | 'prefix_tree' | null

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

  const fetchSubmission = useCallback(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/submission/${submissionId}`);

      if (!response.ok) {
        throw new Error('Submission not found');
      }

      const data = await response.json();
      setSubmission(data);
      if (!hasLoadedRef.current && data.read_topics?.length) {
        setReadTopics(new Set(data.read_topics));
        lastSyncedRef.current = JSON.stringify([...data.read_topics].sort());
      }
      hasLoadedRef.current = true;
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

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
  }, [fetchSubmission, submissionId]);

  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        const { id, topics } = pendingSaveRef.current;
        const blob = new Blob([JSON.stringify({ read_topics: topics })], { type: 'application/json' });
        navigator.sendBeacon(`http://127.0.0.1:8000/api/submission/${id}/read-topics`, blob);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    const topicsArr = [...readTopics];
    const serialized = JSON.stringify([...topicsArr].sort());
    if (serialized === lastSyncedRef.current) return;

    pendingSaveRef.current = { id: submissionId, topics: topicsArr };

    const timer = setTimeout(() => {
      fetch(`http://127.0.0.1:8000/api/submission/${submissionId}/read-topics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read_topics: topicsArr }),
      })
      .then(() => {
        lastSyncedRef.current = serialized;
        pendingSaveRef.current = null;
      })
      .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [readTopics, submissionId]);

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

  const toggleReadAll = useCallback(() => {
    const allTopicNames = (submission?.results?.topics || [])
      .filter(t => t?.name)
      .map(t => t.name);
    const allRead = allTopicNames.length > 0 && allTopicNames.every(n => readTopics.has(n));
    if (allRead) {
      setReadTopics(new Set());
    } else {
      setReadTopics(new Set(allTopicNames));
    }
  }, [submission, readTopics]);

  const getTopicSelectionKey = (topicOrTopics) => {
    if (!topicOrTopics) return '';
    if (Array.isArray(topicOrTopics)) {
      return topicOrTopics
        .map(topic => topic?.name)
        .filter(Boolean)
        .sort()
        .join('|');
    }
    return topicOrTopics.name || '';
  };

  const toggleShowPanel = (topicOrTopics) => {
    const isSameSelection = getTopicSelectionKey(panelTopic) === getTopicSelectionKey(topicOrTopics);

    if (showPanel && isSameSelection) {
      setShowPanel(false);
      setPanelTopic(null);
    } else {
      setShowPanel(true);
      setPanelTopic(topicOrTopics);
    }
  };

  const getSentenceElement = (articleIndex, sentenceIndex) => {
    const byId = document.getElementById(`sentence-${articleIndex}-${sentenceIndex}`);
    if (byId) {
      return byId;
    }
    return document.querySelector(
      `[data-article-index="${articleIndex}"][data-sentence-index="${sentenceIndex}"]`
    );
  };

  const getCharElement = (articleIndex, charStart) => {
    const exact = document.querySelector(
      `[data-article-index="${articleIndex}"][data-char-start="${charStart}"]`
    );
    if (exact) {
      return exact;
    }

    const candidates = Array.from(
      document.querySelectorAll(`[data-article-index="${articleIndex}"][data-char-start]`)
    );
    if (candidates.length === 0) {
      return null;
    }

    const withOffsets = candidates
      .map((el) => ({
        el,
        start: Number(el.getAttribute('data-char-start'))
      }))
      .filter((entry) => Number.isFinite(entry.start))
      .sort((a, b) => a.start - b.start);

    const firstAfter = withOffsets.find((entry) => entry.start >= charStart);
    if (firstAfter) {
      return firstAfter.el;
    }

    return withOffsets[withOffsets.length - 1].el;
  };

  const getTopicAnchors = (topic) => {
    if (!topic || !topic.name) {
      return [];
    }

    const related = safeTopics.find((t) => t.name === topic.name);
    if (!related) {
      return [];
    }

    const ranges = Array.isArray(related.ranges) ? related.ranges : [];
    const anchors = ranges
      .map((range) => {
        const normalizedRange = activeTab === 'raw_text'
          ? normalizeCharRange(range, rawText.length)
          : {
            start: Number(range?.start),
            end: Number(range?.end)
          };

        if (!normalizedRange) {
          return null;
        }

        return {
          charStart: normalizedRange.start,
          charEnd: normalizedRange.end,
          sentenceStart: Number(range?.sentence_start) - 1
        };
      })
      .filter((target) => target && Number.isFinite(target.charStart) && Number.isFinite(target.charEnd))
      .sort((a, b) => a.charStart - b.charStart);

    if (anchors.length > 0) {
      return anchors;
    }

    const sentenceTargets = Array.isArray(related.sentences) ? related.sentences : [];
    return sentenceTargets
      .map((num) => Number(num) - 1)
      .filter((index) => Number.isInteger(index) && index >= 0)
      .sort((a, b) => a - b)
      .map((sentenceStart) => ({
        sentenceStart
      }));
  };

  const navigateTopicSentence = (topic, direction = 'next') => {
    if (activeTab === 'summary') {
      const paraIndices = topicSummaryParaMap[topic.name];
      if (!paraIndices || paraIndices.length === 0) return;

      if (direction === 'focus') {
        const el = document.getElementById(`summary-para-${paraIndices[0]}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const viewportTop = window.scrollY || document.documentElement.scrollTop || 0;
      const viewportBottom = viewportTop + (window.innerHeight || document.documentElement.clientHeight || 0);
      const margin = 8;

      let targetEl = null;
      if (direction === 'next') {
        for (const idx of paraIndices) {
          const el = document.getElementById(`summary-para-${idx}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top + window.scrollY > viewportBottom - margin) {
              targetEl = el;
              break;
            }
          }
        }
      } else {
        for (let i = paraIndices.length - 1; i >= 0; i -= 1) {
          const el = document.getElementById(`summary-para-${paraIndices[i]}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.bottom + window.scrollY < viewportTop + margin) {
              targetEl = el;
              break;
            }
          }
        }
      }

      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const targets = getTopicAnchors(topic);
    if (targets.length === 0) return;

    const viewportTop = window.scrollY || document.documentElement.scrollTop || 0;
    const viewportBottom = viewportTop + (window.innerHeight || document.documentElement.clientHeight || 0);
    const margin = 8;

    const resolveElement = (target) => {
      if (Number.isFinite(target.charStart)) {
        return getCharElement(0, target.charStart);
      }
      return getSentenceElement(0, target.sentenceStart);
    };

    if (direction === 'focus') {
      const targetEl = resolveElement(targets[0]);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    let targetIndex = -1;
    if (direction === 'next') {
      for (let i = 0; i < targets.length; i += 1) {
        const el = resolveElement(targets[i]);
        if (el) {
          const rect = el.getBoundingClientRect();
          const absTop = rect.top + window.scrollY;
          if (absTop > viewportBottom - margin) {
            targetIndex = i;
            break;
          }
        }
      }
    } else {
      for (let i = targets.length - 1; i >= 0; i -= 1) {
        const el = resolveElement(targets[i]);
        if (el) {
          const rect = el.getBoundingClientRect();
          const absBottom = rect.bottom + window.scrollY;
          if (absBottom < viewportTop + margin) {
            targetIndex = i;
            break;
          }
        }
      }
    }

    // If no target exists outside of viewport in requested direction, keep scroll position.
    if (targetIndex === -1) return;

    const targetEl = resolveElement(targets[targetIndex]);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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
  const { highlightRanges: rawTextHighlightRanges, fadeRanges: rawTextFadeRanges } = buildTopicStateRanges(
    safeTopics,
    selectedTopics,
    hoveredTopic,
    readTopics,
    rawText.length
  );

  // Map: { [topicName]: [summaryParaIndex, ...] } -- which summary paragraphs overlap with each topic's sentences
  const topicSummaryParaMap = (() => {
    const mappings = results.summary_mappings;
    if (!Array.isArray(mappings) || mappings.length === 0) return {};
    const map = {};
    for (const topic of safeTopics) {
      if (!topic.name || !Array.isArray(topic.sentences)) continue;
      const topicSentenceSet = new Set(topic.sentences);
      const paraIndices = [];
      for (const mapping of mappings) {
        if (!Array.isArray(mapping.source_sentences)) continue;
        if (mapping.source_sentences.some(s => topicSentenceSet.has(s))) {
          paraIndices.push(mapping.summary_index);
        }
      }
      if (paraIndices.length > 0) {
        map[topic.name] = paraIndices;
      }
    }
    return map;
  })();

  // Set of summary paragraph indices highlighted by currently selected topics
  const highlightedSummaryParas = (() => {
    const set = new Set();
    for (const topic of selectedTopics) {
      const indices = topicSummaryParaMap[topic.name];
      if (Array.isArray(indices)) {
        for (const idx of indices) set.add(idx);
      }
    }
    return set;
  })();

  const summaryTimelineItems = buildSummaryTimelineItems(
    results.summary,
    results.summary_mappings,
    safeTopics
  );

  return (
    <div className="app">
      <div style={{ flex: '0 0 auto', padding: '5px 5px 0' }}>
        <div className="text-management" style={{ padding: '6px 12px', margin: '0 0 12px 0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#666', whiteSpace: 'nowrap' }}>Status:</span>
              <StatusIndicator tasks={status.tasks} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#666', whiteSpace: 'nowrap' }}>Recalculate:</span>
              <button className="action-btn" style={{ padding: '1px 6px', fontSize: '10px' }} onClick={() => runRefresh(['all'], 'Recalculation queued for all tasks.')} disabled={actionLoading}>All</button>
              <button className="action-btn" style={{ padding: '1px 6px', fontSize: '10px' }} onClick={() => runRefresh(['split_topic_generation', 'subtopics_generation', 'summarization', 'mindmap'], 'Topic-related tasks queued.')} disabled={actionLoading}>Topics</button>
              <button className="action-btn" style={{ padding: '1px 6px', fontSize: '10px' }} onClick={() => runRefresh(['summarization'], 'Summarization queued.')} disabled={actionLoading}>Summary</button>
              <button className="action-btn" style={{ padding: '1px 6px', fontSize: '10px' }} onClick={() => runRefresh(['mindmap'], 'Mindmap queued.')} disabled={actionLoading}>Mindmap</button>
              <button className="action-btn" style={{ padding: '1px 6px', fontSize: '10px' }} onClick={() => runRefresh(['prefix_tree'], 'Prefix tree queued.')} disabled={actionLoading}>Prefix Tree</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <RefreshButton submissionId={submissionId} onRefresh={fetchSubmission} compact={true} />
              <button
                className="action-btn danger"
                onClick={handleDelete}
                disabled={actionLoading}
                style={{ padding: '3px 10px', fontSize: '12px' }}
              >
                Delete
              </button>
            </div>
          </div>
          {actionMessage && <div className="text-management-message" style={{ marginTop: '4px', fontSize: '11px' }}>{actionMessage}</div>}
        </div>

        {articles.length > 0 && (
          <div className="tab-bar">
            <div className="tab-group">
              <span className="tab-group-label">Views</span>
              <div className="tabs">
                {SIDEBAR_TABS.map(tab => (
                  <button key={tab.key} className={activeTab === tab.key ? 'active' : ''}
                    onClick={() => handleTabClick(tab.key)}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
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
              <h1>Topics ({safeTopics.length})</h1>
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
              />
            </div>
            <div className="right-column">
              {showPanel && panelTopic && (() => {
                const topicsToShow = Array.isArray(panelTopic) ? panelTopic : [panelTopic];
                const topicNames = topicsToShow.map(topic => topic.name);
                const totalSentences = topicsToShow.reduce((sum, topic) => sum + (topic.totalSentences || 0), 0);
                const displayName = Array.isArray(panelTopic)
                  ? `${topicsToShow[0].name.split(/[\s_]/)[0]} (${topicsToShow.length} topics)`
                  : panelTopic.name;

                const selectedArticle = articles[0];
                const relatedTopics = selectedArticle.topics.filter(topic => topicNames.includes(topic.name));
                const allSentenceIndices = new Set();
                relatedTopics.forEach(topic => {
                  topic.sentences.forEach(idx => allSentenceIndices.add(idx));
                });
                const sortedIndices = Array.from(allSentenceIndices).sort((a, b) => a - b);

                return (
                  <div className="overlay-panel">
                    <div className="overlay-header">
                      <div className="overlay-title-section">
                        <h2>Sentences for {displayName}: {totalSentences} sentences</h2>
                        {!Array.isArray(panelTopic) && panelTopic.summary && (
                          <div className="overlay-summary-note">
                            <span className="summary-icon">📝</span> {panelTopic.summary}
                          </div>
                        )}
                      </div>
                      <button onClick={() => toggleShowPanel(panelTopic)} className="close-panel">×</button>
                    </div>
                    <div className="overlay-content">
                      <div className="article-section">
                        <h3>Analyzed text ({relatedTopics.map(topic => topic.name).join(', ')})</h3>
                        <div className="article-text">
                          {sortedIndices.map((sentenceIndex, idx) => {
                            const sentence = selectedArticle.sentences[sentenceIndex - 1];
                            const isGap = idx > 0 && sortedIndices[idx] !== sortedIndices[idx - 1] + 1;

                            return (
                              <React.Fragment key={sentenceIndex}>
                                {isGap && <div className="sentence-gap">...</div>}
                                <span className="sentence-block">{sentence} </span>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="article-section">
                <div className="article-header">
                  {submission.source_url && (
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                      Source: <a href={submission.source_url} target="_blank" rel="noopener noreferrer">{submission.source_url}</a>
                    </div>
                  )}
                </div>

                {activeTab === 'summary' ? (
                  <div className="summary-content">
                    <h2>Summary</h2>
                    <div className="summary-timeline">
                      {Array.isArray(results.summary) && results.summary.length > 0 ? (
                        summaryTimelineItems.map((item) => (
                          <React.Fragment key={item.index}>
                            {item.showSectionLabel && item.topLevelLabel && (
                              <div
                                className="timeline-section-marker"
                                style={{
                                  '--timeline-section-bg': item.topicColor?.sectionSurface,
                                  '--timeline-section-border': item.topicColor?.sectionBorder,
                                  '--timeline-section-text': item.topicColor?.sectionText,
                                  '--timeline-section-dot': item.topicColor?.dot
                                }}
                              >
                                <span className="timeline-section-pill">{item.topLevelLabel}</span>
                              </div>
                            )}
                            <div
                              id={`summary-para-${item.index}`}
                              data-summary-index={item.index}
                              className={`timeline-item${highlightedSummaryParas.has(item.index) ? ' summary-paragraph-highlighted' : ''}`}
                              style={{
                                '--timeline-topic-accent': item.topicColor?.accent,
                                '--timeline-topic-dot': item.topicColor?.dot,
                                '--timeline-topic-surface': item.topicColor?.surface,
                                '--timeline-topic-border': item.topicColor?.border,
                                '--timeline-subtopic-color': item.topicColor?.subtopicText
                              }}
                            >
                              <div
                                className={`timeline-subtopic${item.subtopicLabel ? '' : ' timeline-subtopic--empty'}`}
                                aria-hidden={item.subtopicLabel ? undefined : 'true'}
                              >
                                {item.subtopicLabel}
                              </div>
                              <div className="timeline-dot" />
                              <div className="timeline-card">
                                <span className="timeline-label">§{item.index + 1}</span>
                                <p className="summary-paragraph-text">
                                  {item.summaryText}
                                  {item.mapping && (
                                    <>
                                      {' '}
                                      <button
                                        className="summary-source-link"
                                        onClick={() => handleSummaryClick(item.mapping, articles[0])}
                                        title="View source sentences"
                                      >
                                        [source]
                                      </button>
                                    </>
                                  )}
                                </p>
                              </div>
                            </div>
                          </React.Fragment>
                        ))
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
                ) : activeTab === 'raw_text' ? (
                  <div className="summary-content">
                    <h2>Raw Text</h2>
                    <div className="raw-text-meta" style={{ marginBottom: '10px' }}>
                      {rawText.length.toLocaleString()} characters
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
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {fullscreenGraph === 'topics' && (
            <FullScreenGraph title="Topics" onClose={closeFullscreenGraph}>
              <div className="topics-bar-chart-container" style={{ padding: '20px' }}>
                <TopicsBarChart topics={allTopics} sentences={safeSentences} />
              </div>
            </FullScreenGraph>
          )}

          {fullscreenGraph === 'topics_river' && (
            <FullScreenGraph title="Topics River" onClose={closeFullscreenGraph}>
              <div className="topics-river-container" style={{ padding: '20px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
                <div style={{ marginBottom: '60px' }}>
                  <h2>Topics River</h2>
                  <p>Visualization of topic density across the article.</p>
                  <TopicsRiverChart topics={safeTopics} sentences={safeSentences} articleLength={safeSentences.length} />
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
                    />
                  ) : (
                    <p style={{ fontStyle: 'italic', color: '#666' }}>No subtopics data available.</p>
                  )}
                </div>
              </div>
            </FullScreenGraph>
          )}

          {fullscreenGraph === 'marimekko' && (
            <FullScreenGraph title="Marimekko" onClose={closeFullscreenGraph}>
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
              onCloseFullscreen={closeFullscreenGraph}
            />
          )}

          {fullscreenGraph === 'prefix_tree' && (
            <PrefixTreeResults
              treeData={results.prefix_tree || {}}
              sentences={safeSentences}
              fullscreen={true}
              onCloseFullscreen={closeFullscreenGraph}
            />
          )}

          {fullscreenGraph === 'tags_cloud' && (
            <FullScreenGraph title="Tags Cloud" onClose={closeFullscreenGraph}>
              <TopicsTagCloud
                submissionId={submissionId}
                topics={safeTopics}
                sentences={safeSentences}
              />
            </FullScreenGraph>
          )}

          {fullscreenGraph === 'circular_packing' && (
            <FullScreenGraph title="Topic Circles" onClose={closeFullscreenGraph}>
              <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{ marginBottom: '12px' }}>
                  Hierarchical circle packing: top-level topics contain their subtopics. Circle size reflects sentence count.
                </p>
                <div style={{ flex: 1 }}>
                  <CircularPackingChart topics={safeTopics} sentences={safeSentences} />
                </div>
              </div>
            </FullScreenGraph>
          )}

          {fullscreenGraph === 'radar_chart' && (
            <FullScreenGraph title="Radar Chart" onClose={closeFullscreenGraph}>
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
              onClose={closeFullscreenGraph}
            />
          )}

          {fullscreenGraph === 'article_structure' && (
            <FullScreenGraph title="Article Structure" onClose={closeFullscreenGraph}>
              <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <ArticleStructureChart topics={safeTopics} sentences={safeSentences} />
              </div>
            </FullScreenGraph>
          )}
        </>) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            <p>No results yet. Processing is in progress...</p>
          </div>
        )}
    </div>
  );
}

export default TextPage;
