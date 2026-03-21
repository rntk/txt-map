import React, { useState, useMemo, useCallback } from 'react';
import { useSubmission } from '../hooks/useSubmission';
import TextDisplay from './TextDisplay';
import CircularPackingChart from './CircularPackingChart';
import TopicsTagCloud from './TopicsTagCloud';
import SummaryTimeline from './SummaryTimeline';
import TopicSentencesModal from './shared/TopicSentencesModal';
import { buildSummaryTimelineItems } from '../utils/summaryTimeline';

const VIS_TABS = [
  { key: 'sentences', label: 'Sentences' },
  { key: 'circles', label: 'Topics (Circles)' },
  { key: 'summaries', label: 'Summaries' },
  { key: 'tags', label: 'Tags Cloud' }
];

export default function WordPage() {
  const pathParts = window.location.pathname.split('/');
  const submissionId = pathParts[3];
  const word = decodeURIComponent(pathParts[4] || '');

  const navigate = (path) => { window.location.href = path; };

  const [activeTab, setActiveTab] = useState('sentences');
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [summaryModalTopic, setSummaryModalTopic] = useState(null);

  const {
    submission,
    loading,
    error,
    readTopics,
    toggleRead,
  } = useSubmission(submissionId);

  // Derive subsets
  const matchingData = useMemo(() => {
    if (!submission?.results) return { sentences: [], topics: [], summaries: [] };
    
    const allSentences = submission.results.sentences || [];
    const allTopics = submission.results.topics || [];

    // 1. Find matched sentences
    const wordPattern = new RegExp(`\\b${word}\\b`, 'i');
    
    // We will keep them as original 1-indexed for reference
    const matchedSentencesInfo = [];
    const matchedSentence1BasedIndices = new Set();
    
    allSentences.forEach((text, i) => {
      if (wordPattern.test(text)) {
        matchedSentencesInfo.push({ index: i, text });
        matchedSentence1BasedIndices.add(i + 1);
      }
    });

    // 2. Find topics containing matched sentences
    const matchedTopics = allTopics.map(topic => {
      const topicSents = Array.isArray(topic.sentences) ? topic.sentences : [];
      // Intersection
      const intersection = topicSents.filter(idx => matchedSentence1BasedIndices.has(idx));
      if (intersection.length > 0) {
        return { ...topic, sentences: intersection };
      }
      return null;
    }).filter(Boolean);

    // 3. Summaries
    const validSummaries = [];
    const topicSummaries = submission.results.topic_summaries || {};
    matchedTopics.forEach(topic => {
      if (topicSummaries[topic.name]) {
        validSummaries.push({
          topicName: topic.name,
          summary: topicSummaries[topic.name]
        });
      }
    });

    // 4. Summary Timeline Items
    const allTimelineItems = buildSummaryTimelineItems(
      submission.results.summary || [],
      submission.results.summary_mappings || [],
      allTopics
    );
    const filteredTimelineItems = allTimelineItems.filter(item => 
      item.mapping?.source_sentences?.some(s => matchedSentence1BasedIndices.has(s))
    );

    // Recompute `showSectionLabel` because filtering might have removed the first item of a section
    let previousTopLevel = null;
    const finalTimelineItems = filteredTimelineItems.map(item => {
      const showSection = Boolean(item.topLevelLabel && item.topLevelLabel !== previousTopLevel);
      if (item.topLevelLabel) {
        previousTopLevel = item.topLevelLabel;
      }
      return { ...item, showSectionLabel: showSection };
    });

    return {
      sentencesInfo: matchedSentencesInfo,
      topics: matchedTopics,
      summaries: validSummaries,
      timelineItems: finalTimelineItems,
      allSentences: allSentences,
      allTopics: allTopics,
    };
  }, [submission, word]);

  const handleTabClick = (key) => setActiveTab(key);

  const toggleTopic = useCallback((topic) => {
    setSelectedTopics(prev => {
      const exists = prev.some(t => t.name === topic.name);
      return exists ? prev.filter(t => t.name !== topic.name) : [...prev, topic];
    });
  }, []);

  const { sentencesInfo, topics, summaries, timelineItems, allSentences, allTopics } = matchingData;

  const handleSummaryClick = useCallback((mapping, article, topicName) => {
    if (mapping && mapping.source_sentences) {
      setSummaryModalTopic({
        displayName: topicName || 'Source Sentences',
        fullPath: topicName || null,
        sentenceIndices: mapping.source_sentences,
        _summarySentence: mapping.summary_sentence,
        _sentences: article.sentences,
      });
    }
  }, []);

  const articles = useMemo(() => [{
    sentences: allSentences,
    topics: allTopics,
    topic_summaries: submission?.results?.topic_summaries || {},
  }], [allSentences, allTopics, submission]);

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading word data...</div>;
  if (error) return <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>Error: {error}</div>;
  if (!submission) return <div style={{ padding: '20px', textAlign: 'center' }}>No submission found.</div>;



  return (
    <div className="app word-page">
      <div style={{ flex: '0 0 auto', padding: '5px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate(`/page/text/${submissionId}`)} className="action-btn">
            ← Back to Article
          </button>
          <h2>Sentences matching: <span style={{ color: '#1976d2' }}>"{word}"</span></h2>
          <div className="tab-bar" style={{ marginBottom: 0, marginLeft: 'auto' }}>
            <div className="tabs">
              {VIS_TABS.map(tab => (
                <button
                  key={tab.key}
                  className={activeTab === tab.key ? 'active' : ''}
                  onClick={() => handleTabClick(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '0 5px 5px', display: 'block', height: 'auto', flex: 1 }}>
        <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', height: '100%', overflowY: 'auto' }}>
          
          {activeTab === 'sentences' && (
            <div>
              {sentencesInfo.length === 0 ? (
                <p style={{ color: '#666' }}>No occurrences of this word were found in the article.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '5px' }}>
                  {sentencesInfo.map(({ index, text }) => (
                    <div key={index} style={{ padding: '6px', background: '#f8f9fa', borderRadius: '6px', borderLeft: '4px solid #1976d2' }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Sentence #{index + 1}</span>
                      </div>
                      <TextDisplay 
                        sentences={[text]} 
                        selectedTopics={selectedTopics} 
                        hoveredTopic={hoveredTopic} 
                        readTopics={readTopics} 
                        articleTopics={topics.filter(t => t.sentences.includes(index + 1))} 
                        articleIndex={0} 
                        onToggleRead={toggleRead} 
                        onToggleTopic={toggleTopic}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'circles' && (
            <div style={{ height: '70vh' }}>
              <CircularPackingChart 
                topics={topics} 
                sentences={allSentences} 
                onShowInArticle={() => {}} 
              />
            </div>
          )}

          {activeTab === 'summaries' && (
            <div style={{ height: '70vh', position: 'relative' }}>
              <SummaryTimeline 
                summaryTimelineItems={timelineItems}
                highlightedSummaryParas={new Set()}
                summaryModalTopic={null} // Handled locally below for better control in WordPage
                closeSummaryModal={() => setSummaryModalTopic(null)}
                handleSummaryClick={handleSummaryClick}
                articles={articles}
                onClose={() => setActiveTab('sentences')}
                onShowInArticle={(topic) => {
                  navigate(`/page/text/${submissionId}`);
                  // Note: In a real app we might want to pass state to scroll to the topic
                }}
              />
            </div>
          )}

          {activeTab === 'tags' && (
            <div>
              <h3>Tags Cloud for sentences containing "{word}"</h3>
              <TopicsTagCloud 
                submissionId={submissionId} 
                topics={[]} 
                sentences={allSentences}
                forcedPathQuery={`word=${encodeURIComponent(word)}`}
              />
            </div>
          )}

        </div>
      </div>

      {summaryModalTopic && (
        <TopicSentencesModal
          topic={summaryModalTopic}
          sentences={summaryModalTopic._sentences || allSentences}
          onClose={() => setSummaryModalTopic(null)}
        />
      )}
    </div>
  );
}
