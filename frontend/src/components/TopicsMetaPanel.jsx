import React, { useEffect, useState, useMemo } from "react";

/**
 * @typedef {{ word: string, frequency: number }} WordFreq
 * @typedef {{ id: number, keywords: string[], weight: number }} LatentTopic
 * @typedef {{ topic_name: string, latent_topic_ids: number[], scores: number[] }} TopicMapping
 * @typedef {{ cluster_id: number, keywords: string[], sentence_indices: number[] }} Cluster
 * @typedef {{ name: string, sentences: number[] }} Topic
 * @typedef {{ name: string, sentences: number[], parent_topic: string }} Subtopic
 * @typedef {{ latent_topics: LatentTopic[], topic_mapping: TopicMapping[] }} TopicModel
 * @typedef {{ topics: Topic[], clusters: Cluster[], sentences: string[], topic_model: TopicModel, subtopics: Subtopic[], topic_summaries: Record<string, string> }} TopicAnalysisData
 */

/**
 * @param {{ keywords: string[] }} props
 */
function KeywordList({ keywords }) {
  return (
    <div className="topics-meta-panel__keywords">
      {(keywords || []).map((kw) => (
        <span key={kw} className="topics-meta-panel__keyword-tag">
          {kw}
        </span>
      ))}
    </div>
  );
}

/**
 * @param {{ clusters: Array<{ cluster_id: number, keywords: string[], sentence_count: number }> }} props
 */
function PanelClusters({ clusters }) {
  if (!clusters || clusters.length === 0) {
    return (
      <p className="topics-meta-panel__empty">No clusters for this topic.</p>
    );
  }
  return (
    <div className="topics-meta-panel__cards">
      {clusters.map((c) => (
        <div key={c.cluster_id} className="topics-meta-panel__card">
          <div className="topics-meta-panel__card-title">
            Cluster {c.cluster_id + 1}
          </div>
          <KeywordList keywords={c.keywords} />
          <div className="topics-meta-panel__card-meta">
            {c.sentence_count} sentence{c.sentence_count !== 1 ? "s" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{ topicMapping: TopicMapping|null, latentTopics: LatentTopic[] }} props
 */
function PanelLatentTopics({ topicMapping, latentTopics }) {
  if (!topicMapping || !latentTopics || latentTopics.length === 0) {
    return (
      <p className="topics-meta-panel__empty">
        No latent topics for this topic.
      </p>
    );
  }

  const relevantIds = new Set(topicMapping.latent_topic_ids || []);
  const scores = topicMapping.scores || [];
  /** @type {Record<number, number>} */
  const idToScore = {};
  (topicMapping.latent_topic_ids || []).forEach((id, i) => {
    idToScore[id] = scores[i] || 0;
  });

  const filtered = latentTopics.filter((lt) => relevantIds.has(lt.id));
  if (filtered.length === 0) {
    return (
      <p className="topics-meta-panel__empty">
        No latent topics mapped to this topic.
      </p>
    );
  }

  return (
    <div className="topics-meta-panel__cards">
      {filtered.map((lt) => (
        <div key={lt.id} className="topics-meta-panel__card">
          <div className="topics-meta-panel__card-title">
            Latent topic {lt.id + 1}
          </div>
          <KeywordList keywords={lt.keywords} />
          <div className="topics-meta-panel__card-meta">
            Score: {((idToScore[lt.id] || 0) * 100).toFixed(1)}% · Weight:{" "}
            {((lt.weight || 0) * 100).toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{ sentences: string[], sentenceIndices: number[] }} props
 */
function PanelTagCloud({ sentences, sentenceIndices }) {
  /** @type {WordFreq[]} */
  const words = useMemo(() => {
    if (!sentences || !sentenceIndices || sentenceIndices.length === 0)
      return [];
    /** @type {Record<string, number>} */
    const freq = {};
    for (const idx of sentenceIndices) {
      const text = sentences[idx - 1];
      if (!text) continue;
      const tokens = text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2);
      for (const token of tokens) {
        freq[token] = (freq[token] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .map(([word, frequency]) => ({ word, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);
  }, [sentences, sentenceIndices]);

  if (words.length === 0) {
    return (
      <p className="topics-meta-panel__empty">No tag data for this topic.</p>
    );
  }

  return (
    <div className="topics-meta-panel__tag-cloud">
      {words.map(({ word, frequency }) => (
        <span key={word} className="topics-meta-panel__tag-cloud-item">
          {word}
          <span className="topics-meta-panel__tag-cloud-freq">{frequency}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * @param {{ summary: string|null }} props
 */
function PanelSummary({ summary }) {
  if (!summary) {
    return (
      <p className="topics-meta-panel__empty">
        No summary available for this topic.
      </p>
    );
  }
  return (
    <div className="topics-meta-panel__summary">
      <p className="topics-meta-panel__summary-text">{summary}</p>
    </div>
  );
}

/**
 * @param {{ subtopics: Subtopic[] }} props
 */
function PanelSubtopics({ subtopics }) {
  if (!subtopics || subtopics.length === 0) {
    return (
      <p className="topics-meta-panel__empty">No subtopics for this topic.</p>
    );
  }
  return (
    <div className="topics-meta-panel__cards">
      {subtopics.map((st) => (
        <div key={st.name} className="topics-meta-panel__card">
          <div className="topics-meta-panel__card-title">{st.name}</div>
          <div className="topics-meta-panel__card-meta">
            {(st.sentences || []).length} sentence
            {(st.sentences || []).length !== 1 ? "s" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{ submissionId: string, selectedTopicName: string|null }} props
 */
export default function TopicsMetaPanel({ submissionId, selectedTopicName }) {
  /** @type {[TopicAnalysisData|null, React.Dispatch<React.SetStateAction<TopicAnalysisData|null>>]} */
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {string|null} */ (null));

  useEffect(() => {
    if (!submissionId) return;
    setLoading(true);
    setError(null);
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

  const selectedTopic = useMemo(() => {
    if (!data || !data.topics) return null;
    if (!selectedTopicName) return data.topics[0] || null;
    return (
      data.topics.find((t) => t.name === selectedTopicName) ||
      data.topics[0] ||
      null
    );
  }, [data, selectedTopicName]);

  const filteredClusters = useMemo(() => {
    if (!selectedTopic || !data) return [];
    const topicSentenceSet = new Set(selectedTopic.sentences || []);
    return (data.clusters || [])
      .map((c) => {
        const overlapping = (c.sentence_indices || []).filter((idx) =>
          topicSentenceSet.has(idx),
        );
        if (overlapping.length === 0) return null;
        return { ...c, sentence_count: overlapping.length };
      })
      .filter(Boolean);
  }, [data, selectedTopic]);

  const topicMapping = useMemo(() => {
    if (!selectedTopic || !data?.topic_model?.topic_mapping) return null;
    return (
      data.topic_model.topic_mapping.find(
        (m) => m.topic_name === selectedTopic.name,
      ) || null
    );
  }, [data, selectedTopic]);

  const latentTopics = data?.topic_model?.latent_topics || [];

  const topicSummary = useMemo(() => {
    if (!selectedTopic || !data?.topic_summaries) return null;
    return data.topic_summaries[selectedTopic.name] || null;
  }, [data, selectedTopic]);

  const filteredSubtopics = useMemo(() => {
    if (!selectedTopic || !data?.subtopics) return [];
    return data.subtopics.filter(
      (st) => st.parent_topic === selectedTopic.name,
    );
  }, [data, selectedTopic]);

  if (loading) {
    return (
      <aside
        className="reading-page__minimap-panel"
        aria-label="Topics meta panel"
      >
        <div className="reading-page__minimap-header">
          <div className="reading-page__minimap-title">Topics Meta</div>
        </div>
        <p className="topics-meta-panel__empty">Loading…</p>
      </aside>
    );
  }

  if (error) {
    return (
      <aside
        className="reading-page__minimap-panel"
        aria-label="Topics meta panel"
      >
        <div className="reading-page__minimap-header">
          <div className="reading-page__minimap-title">Topics Meta</div>
        </div>
        <p className="topics-meta-panel__empty">Error: {error}</p>
      </aside>
    );
  }

  return (
    <aside
      className="reading-page__minimap-panel topics-meta-panel"
      aria-label="Topics meta panel"
    >
      <div className="reading-page__minimap-header">
        <div className="reading-page__minimap-title">Topics Meta</div>
        {selectedTopic && (
          <div className="reading-page__minimap-subtitle">
            {selectedTopic.name}
          </div>
        )}
      </div>

      <div className="topics-meta-panel__scroll">
        <section className="topics-meta-panel__section">
          <div className="topics-meta-panel__section-title">Summary</div>
          <PanelSummary summary={topicSummary} />
        </section>

        <section className="topics-meta-panel__section">
          <div className="topics-meta-panel__section-title">Subtopics</div>
          <PanelSubtopics subtopics={filteredSubtopics} />
        </section>

        <section className="topics-meta-panel__section">
          <div className="topics-meta-panel__section-title">Latent Topics</div>
          <PanelLatentTopics
            topicMapping={topicMapping}
            latentTopics={latentTopics}
          />
        </section>

        <section className="topics-meta-panel__section">
          <div className="topics-meta-panel__section-title">Clusters</div>
          <PanelClusters clusters={filteredClusters} />
        </section>

        {selectedTopic && (
          <section className="topics-meta-panel__section">
            <div className="topics-meta-panel__section-title">Tag Cloud</div>
            <PanelTagCloud
              sentences={data.sentences}
              sentenceIndices={selectedTopic.sentences || []}
            />
          </section>
        )}
      </div>
    </aside>
  );
}
