import React, { useEffect, useState, useMemo } from 'react';
import { WordCloudDisplay } from './TopicsTagCloud';
import './TopicAnalysisPage.css';

function statusChip(label, status) {
  return (
    <span key={label} className={`status-chip ${status || 'pending'}`}>
      {label}: {status || 'pending'}
    </span>
  );
}

function TopicSelector({ topics, selectedIndex, onSelect }) {
  if (!topics || topics.length === 0) {
    return <p className="not-ready">No topics available.</p>;
  }
  return (
    <div className="topic-selector">
      {topics.map((t, i) => (
        <button
          key={i}
          className={`topic-selector-btn${i === selectedIndex ? ' active' : ''}`}
          onClick={() => onSelect(i)}
          type="button"
        >
          {t.name} ({(t.sentences || []).length} sentences)
        </button>
      ))}
    </div>
  );
}

function ClustersSection({ clusters }) {
  if (!clusters || clusters.length === 0) {
    return <p className="not-ready">No clusters available for this topic.</p>;
  }
  return (
    <div className="clusters-grid">
      {clusters.map((c) => (
        <div key={c.cluster_id} className="cluster-card">
          <div className="cluster-id">Cluster {c.cluster_id + 1}</div>
          <div className="keywords">
            {(c.keywords || []).map((kw) => (
              <span key={kw} className="keyword-tag">{kw}</span>
            ))}
          </div>
          <div className="cluster-meta">{c.sentence_count} sentence{c.sentence_count !== 1 ? 's' : ''}</div>
        </div>
      ))}
    </div>
  );
}

function TagCloudSection({ sentences, sentenceIndices }) {
  const words = useMemo(() => {
    if (!sentences || !sentenceIndices || sentenceIndices.length === 0) return [];

    const freq = {};
    for (const idx of sentenceIndices) {
      const text = sentences[idx - 1];
      if (!text) continue;
      const tokens = text.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      for (const token of tokens) {
        freq[token] = (freq[token] || 0) + 1;
      }
    }

    return Object.entries(freq)
      .map(([word, frequency]) => ({ word, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 80);
  }, [sentences, sentenceIndices]);

  if (words.length === 0) {
    return <p className="not-ready">No tag data available for this topic.</p>;
  }

  return (
    <div className="tag-cloud-wrapper">
      <WordCloudDisplay words={words} onWordClick={null} />
    </div>
  );
}

function LatentTopicsSection({ topicMapping, latentTopics }) {
  if (!topicMapping || !latentTopics || latentTopics.length === 0) {
    return <p className="not-ready">No latent topics available for this topic.</p>;
  }

  const relevantIds = new Set(topicMapping.latent_topic_ids || []);
  const scores = topicMapping.scores || [];
  const idToScore = {};
  (topicMapping.latent_topic_ids || []).forEach((id, i) => {
    idToScore[id] = scores[i] || 0;
  });

  const filtered = latentTopics.filter((lt) => relevantIds.has(lt.id));

  if (filtered.length === 0) {
    return <p className="not-ready">No latent topics mapped to this topic.</p>;
  }

  return (
    <div className="clusters-grid">
      {filtered.map((lt) => (
        <div key={lt.id} className="cluster-card">
          <div className="cluster-id">Latent topic {lt.id + 1}</div>
          <div className="keywords">
            {(lt.keywords || []).map((kw) => (
              <span key={kw} className="keyword-tag">{kw}</span>
            ))}
          </div>
          <div className="cluster-meta">
            Score: {((idToScore[lt.id] || 0) * 100).toFixed(1)}% · Weight: {((lt.weight || 0) * 100).toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TopicAnalysisPage() {
  const pathParts = window.location.pathname.split('/');
  // URL: /page/topic-analysis/{submission_id}
  const submissionId = pathParts[3] || null;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTopicIndex, setSelectedTopicIndex] = useState(0);

  useEffect(() => {
    if (data && data.topics) {
      const searchParams = new URLSearchParams(window.location.search);
      const topicName = searchParams.get('topic');
      if (topicName) {
        const index = data.topics.findIndex((t) => t.name === topicName);
        if (index !== -1) {
          setSelectedTopicIndex(index);
        }
      }
    }
  }, [data]);

  useEffect(() => {
    if (!submissionId) {
      setError('No submission ID in URL.');
      setLoading(false);
      return;
    }

    fetch(`/api/submission/${submissionId}/topic-analysis`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [submissionId]);

  if (loading) {
    return <div className="topic-analysis-page">Loading…</div>;
  }
  if (error) {
    return <div className="topic-analysis-page">Error: {error}</div>;
  }

  const { topics, clusters, sentences, topic_model, task_status, source_url } = data;
  const selectedTopic = (topics || [])[selectedTopicIndex] || null;
  const topicSentenceIndices = selectedTopic ? (selectedTopic.sentences || []) : [];
  const topicSentenceSet = new Set(topicSentenceIndices);

  // Filter clusters to those that overlap with the selected topic's sentences.
  const filteredClusters = (clusters || [])
    .map((c) => {
      const overlapping = (c.sentence_indices || []).filter((idx) => topicSentenceSet.has(idx));
      if (overlapping.length === 0) return null;
      return { ...c, sentence_count: overlapping.length };
    })
    .filter(Boolean);

  // Find topic mapping for the selected topic.
  const topicMapping = selectedTopic && topic_model && topic_model.topic_mapping
    ? topic_model.topic_mapping.find((m) => m.topic_name === selectedTopic.name) || null
    : null;

  return (
    <div className="topic-analysis-page">
      <h1>Topic Analysis</h1>
      {source_url && <div className="source-url">{source_url}</div>}

      <div className="status-bar">
        {statusChip('split_topic', task_status?.split_topic_generation)}
        {statusChip('clustering', task_status?.clustering_generation)}
        {statusChip('topic_model', task_status?.topic_modeling_generation)}
        <a href={`/page/text/${submissionId}`} className="back-link">
          ← Back to text
        </a>
      </div>

      <div className="topic-analysis-section">
        <h2>Topics ({(topics || []).length})</h2>
        <TopicSelector
          topics={topics}
          selectedIndex={selectedTopicIndex}
          onSelect={setSelectedTopicIndex}
        />
      </div>

      {selectedTopic && (
        <>
          <div className="topic-analysis-section">
            <h2>
              {selectedTopic.name} — Clusters ({filteredClusters.length})
            </h2>
            <ClustersSection clusters={filteredClusters} />
          </div>

          <div className="topic-analysis-section">
            <h2>{selectedTopic.name} — Tags Cloud</h2>
            <TagCloudSection sentences={sentences} sentenceIndices={topicSentenceIndices} />
          </div>

          {topic_model && topic_model.latent_topics && topic_model.latent_topics.length > 0 && (
            <div className="topic-analysis-section">
              <h2>{selectedTopic.name} — Latent Topics</h2>
              <LatentTopicsSection
                topicMapping={topicMapping}
                latentTopics={topic_model.latent_topics}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
