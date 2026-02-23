import React, { useState, useMemo, useEffect, useCallback } from 'react';

// ── Word cloud renderer ────────────────────────────────────────────────────────

function WordCloudDisplay({ words, onWordClick, emptyMessage = 'No data available.' }) {
  if (!words || words.length === 0) {
    return (
      <div style={{ color: '#888', fontStyle: 'italic', textAlign: 'center', padding: '30px' }}>
        {emptyMessage}
      </div>
    );
  }

  const maxFreq = Math.max(...words.map(w => w.frequency));
  const minFreq = Math.min(...words.map(w => w.frequency));
  const minSize = 12;
  const maxSize = 46;

  const getSize = (freq) => {
    if (maxFreq === minFreq) return (maxSize + minSize) / 2;
    return minSize + ((freq - minFreq) / (maxFreq - minFreq)) * (maxSize - minSize);
  };

  const getColor = (word) => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) & 0x7fffffff;
    }
    const hue = (hash % 280) + 20;
    return `hsl(${hue}, 55%, 32%)`;
  };

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px 16px',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      background: '#f8f9fa',
      borderRadius: '8px',
      minHeight: '90px',
      border: '1px solid #e9ecef',
    }}>
      {words.map(({ word, frequency }) => (
        <span
          key={word}
          title={`${word}: ${frequency}`}
          onClick={() => onWordClick?.(word)}
          style={{
            fontSize: `${getSize(frequency)}px`,
            cursor: onWordClick ? 'pointer' : 'default',
            color: getColor(word),
            fontWeight: frequency >= maxFreq * 0.5 ? '600' : '400',
            lineHeight: 1.3,
            userSelect: 'none',
            padding: '2px 4px',
            borderRadius: '3px',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (onWordClick) e.currentTarget.style.background = '#e3f2fd'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {word}
        </span>
      ))}
    </div>
  );
}

// ── Topic hierarchy helpers (pure string manipulation, no NLP) ─────────────────

function getChildTopics(topics, navPath) {
  return topics.filter(topic => {
    const parts = topic.name.split('>').map(s => s.trim());
    if (parts.length <= navPath.length) return false;
    return navPath.every((seg, i) => parts[i] === seg);
  });
}

function buildTopicWordCloud(topics, navPath) {
  const freq = {};
  getChildTopics(topics, navPath).forEach(topic => {
    const parts = topic.name.split('>').map(s => s.trim());
    const word = parts[navPath.length];
    if (word) {
      freq[word] = (freq[word] || 0) + (topic.sentences?.length || 1);
    }
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([word, frequency]) => ({ word, frequency }));
}

function getSentenceIndicesForPath(topics, navPath) {
  const topicMatches = (name) => {
    const parts = (name || '').split('>').map(s => s.trim());
    if (parts.length < navPath.length) return false;
    return navPath.every((seg, i) => parts[i] === seg);
  };

  const indices = new Set();
  topics
    .filter(topic => topicMatches(topic.name))
    .forEach((topic) => {
      (topic.sentences || []).forEach((idx) => {
        const num = Number(idx);
        if (Number.isInteger(num)) {
          indices.add(num);
        }
      });
    });

  return Array.from(indices).sort((a, b) => a - b);
}

// ── Main component ─────────────────────────────────────────────────────────────

function TopicsTagCloud({ submissionId, topics, sentences }) {
  const [navPath, setNavPath] = useState([]);
  const [selectedKeyword, setSelectedKeyword] = useState(null);

  // Sentence word cloud fetched from backend
  const [sentenceWords, setSentenceWords] = useState([]);
  const [sentenceCount, setSentenceCount] = useState(0);
  const [loadingCloud, setLoadingCloud] = useState(false);

  // Sub-topic navigation cloud is computed locally — it's pure string work.
  const topicWords = useMemo(
    () => buildTopicWordCloud(topics, navPath),
    [topics, navPath]
  );

  const scopedSentenceIndices = useMemo(
    () => getSentenceIndicesForPath(topics, navPath),
    [topics, navPath]
  );

  const scopedSentences = useMemo(
    () => scopedSentenceIndices
      .filter(idx => idx >= 1 && idx <= (sentences?.length || 0))
      .map(idx => ({ index: idx, text: sentences[idx - 1] || '' })),
    [scopedSentenceIndices, sentences]
  );

  const keywordSentences = useMemo(() => {
    if (!selectedKeyword) return [];
    const safeKeyword = selectedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${safeKeyword}\\b`, 'i');
    return scopedSentences.filter(({ text }) => pattern.test(text));
  }, [selectedKeyword, scopedSentences]);

  // Fetch sentence word cloud from backend whenever the path changes.
  const fetchWordCloud = useCallback(async (path) => {
    setLoadingCloud(true);
    try {
      const params = new URLSearchParams();
      path.forEach(seg => params.append('path', seg));
      const res = await fetch(
        `http://127.0.0.1:8000/api/submission/${submissionId}/word-cloud?${params}`
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSentenceWords(data.words || []);
      setSentenceCount(data.sentence_count || 0);
    } catch (err) {
      console.error('word-cloud fetch failed:', err);
      setSentenceWords([]);
      setSentenceCount(0);
    } finally {
      setLoadingCloud(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetchWordCloud(navPath);
  }, [fetchWordCloud, navPath]);

  useEffect(() => {
    setSelectedKeyword(null);
  }, [navPath]);

  const isRoot = navPath.length === 0;

  const handleTopicClick = (word) => setNavPath(prev => [...prev, word]);
  const handleKeywordClick = (word) => {
    setSelectedKeyword(prev => (prev === word ? null : word));
  };
  const handleBack = () => setNavPath(prev => prev.slice(0, -1));
  const handleBreadcrumbClick = (index) => setNavPath(navPath.slice(0, index + 1));

  return (
    <div style={{ padding: '20px' }}>
      {/* Breadcrumb + back button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {!isRoot && (
          <button
            onClick={handleBack}
            style={{
              padding: '5px 12px',
              background: '#e3f2fd',
              border: '1px solid #90caf9',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#1565c0',
              fontWeight: '500',
            }}
          >
            ← Back
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '14px', flexWrap: 'wrap' }}>
          <span
            style={{
              cursor: isRoot ? 'default' : 'pointer',
              color: isRoot ? '#333' : '#1976d2',
              fontWeight: isRoot ? '600' : '400',
              padding: '0 4px',
            }}
            onClick={() => !isRoot && setNavPath([])}
          >
            All Topics
          </span>
          {navPath.map((seg, i) => (
            <React.Fragment key={i}>
              <span style={{ color: '#bbb', padding: '0 2px' }}>›</span>
              <span
                style={{
                  cursor: i < navPath.length - 1 ? 'pointer' : 'default',
                  color: i === navPath.length - 1 ? '#333' : '#1976d2',
                  fontWeight: i === navPath.length - 1 ? '600' : '400',
                  padding: '0 4px',
                }}
                onClick={() => i < navPath.length - 1 && handleBreadcrumbClick(i)}
              >
                {seg}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Sub-topic navigation cloud */}
      {topicWords.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: '600', color: '#444' }}>
            {isRoot ? 'Topic categories' : `Sub-topics of "${navPath[navPath.length - 1]}"`}
            <span style={{ fontSize: '12px', fontWeight: '400', color: '#888', marginLeft: '8px' }}>
              — click to explore
            </span>
          </div>
          <WordCloudDisplay words={topicWords} onWordClick={handleTopicClick} />
        </div>
      )}

      {/* Sentence word cloud (from backend) */}
      <div>
          <div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: '600', color: '#444' }}>
            {isRoot ? 'All text' : navPath.join(' › ')} — key words
            {!loadingCloud && sentenceWords.length > 0 && (
              <span style={{ fontSize: '12px', fontWeight: '400', color: '#888', marginLeft: '8px' }}>
                — click a keyword to see matching sentences
              </span>
            )}
            {!loadingCloud && (
              <span style={{ fontSize: '12px', fontWeight: '400', color: '#888', marginLeft: '8px' }}>
                from {sentenceCount} sentence{sentenceCount !== 1 ? 's' : ''}
            </span>
          )}
          {loadingCloud && (
            <span style={{ fontSize: '12px', fontWeight: '400', color: '#aaa', marginLeft: '8px' }}>
              computing…
            </span>
          )}
        </div>
        {loadingCloud ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '90px',
            background: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef',
            color: '#aaa',
            fontSize: '13px',
          }}>
            Loading word cloud…
          </div>
        ) : (
          <WordCloudDisplay
            words={sentenceWords}
            onWordClick={handleKeywordClick}
            emptyMessage="No sentences found for this topic."
          />
        )}
      </div>

      {/* Sentences for selected keyword */}
      {selectedKeyword && (
        <div style={{ marginTop: '32px' }}>
          <div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: '600', color: '#444' }}>
            Sentences containing "{selectedKeyword}"
            <span style={{ fontSize: '12px', fontWeight: '400', color: '#888', marginLeft: '8px' }}>
              {keywordSentences.length} match{keywordSentences.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <div style={{
            background: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef',
            padding: '14px 16px',
          }}>
            {keywordSentences.length === 0 ? (
              <div style={{ color: '#888', fontStyle: 'italic' }}>
                No matching sentences in this topic scope.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {keywordSentences.map(({ index, text }) => (
                  <div key={index} style={{ fontSize: '14px', lineHeight: 1.5, color: '#333' }}>
                    <span style={{ color: '#888', marginRight: '8px', fontSize: '12px' }}>
                      #{index}
                    </span>
                    {text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TopicsTagCloud;
