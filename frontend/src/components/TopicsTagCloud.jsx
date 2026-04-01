import React, { useState, useMemo, useEffect, useCallback } from 'react';
import TopicSentencesModal from './shared/TopicSentencesModal';

// ── Word cloud renderer ────────────────────────────────────────────────────────

function wordHash(word) {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = (hash * 31 + word.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

// Tile accent colors — vibrant but not overwhelming
const TILE_COLORS = [
  { bg: '#ffd740', fg: '#333' },
  { bg: '#69f0ae', fg: '#1b5e20' },
  { bg: '#40c4ff', fg: '#01579b' },
  { bg: '#ff6e40', fg: '#fff' },
  { bg: '#e040fb', fg: '#fff' },
  { bg: '#b2ff59', fg: '#33691e' },
];

// ── Spiral layout engine ────────────────────────────────────────────────────────

function rectOverlaps(a, placed) {
  const margin = 5;
  for (const b of placed) {
    if (
      a.x < b.x + b.w + margin &&
      a.x + a.w > b.x - margin &&
      a.y < b.y + b.h + margin &&
      a.y + a.h > b.y - margin
    ) return true;
  }
  return false;
}

// Returns { items: [{...word, x, y}], totalW, totalH }
function buildCloudLayout(items) {
  const CX = 460;   // virtual canvas centre
  const CY = 260;
  const placed = [];
  const result = [];

  for (const item of items) {
    const { word, fontSize, rotationDeg = 0 } = item;
    const rad = Math.abs(rotationDeg) * (Math.PI / 180);
    // Estimated text dimensions (sans-serif approximation)
    const tw = word.length * fontSize * 0.56;
    const th = fontSize * 1.3;
    // Rotated bounding box
    const bw = tw * Math.cos(rad) + th * Math.sin(rad) + 10;
    const bh = tw * Math.sin(rad) + th * Math.cos(rad) + 6;

    let pos = null;
    for (let step = 0; step < 4000; step++) {
      const angle = step * 0.31;
      const r = step * 1.9;
      const x = CX + r * Math.cos(angle) - bw / 2;
      const y = CY + r * Math.sin(angle) * 0.45 - bh / 2; // 0.45 flattens into wide ellipse
      const rect = { x, y, w: bw, h: bh };
      if (!rectOverlaps(rect, placed)) {
        placed.push(rect);
        pos = { x, y };
        break;
      }
    }
    if (!pos) pos = { x: CX, y: CY };
    result.push({ ...item, x: pos.x, y: pos.y, bw, bh });
  }

  const pad = 24;
  const minX = Math.min(...result.map(r => r.x));
  const minY = Math.min(...result.map(r => r.y));
  const maxX = Math.max(...result.map(r => r.x + r.bw));
  const maxY = Math.max(...result.map(r => r.y + r.bh));

  return {
    items: result.map(r => ({ ...r, x: r.x - minX + pad, y: r.y - minY + pad })),
    totalW: maxX - minX + pad * 2,
    totalH: maxY - minY + pad * 2,
  };
}

// ── Word cloud renderer ─────────────────────────────────────────────────────────

function WordCloudDisplay({ words, onWordClick, emptyMessage = 'No data available.' }) {
  if (!words || words.length === 0) {
    return (
      <div style={{ color: '#aaa', fontStyle: 'italic', textAlign: 'center', padding: '30px' }}>
        {emptyMessage}
      </div>
    );
  }

  const maxFreq = Math.max(...words.map(w => w.frequency));
  const minFreq = Math.min(...words.map(w => w.frequency));

  const norm = (freq) => maxFreq === minFreq ? 0.5 : (freq - minFreq) / (maxFreq - minFreq);
  const getSize = (freq) => 11 + norm(freq) * 41; // 11–52 px

  // Compute per-word visual properties
  const getWordMeta = (word, frequency) => {
    const h = wordHash(word);
    const n = norm(frequency);
    const isTile = n > 0.55 && (h % 3 === 0);
    const rotationDeg = ((h % 7) - 3) * 1.8; // –5.4 … +5.4°
    const fontSize = getSize(frequency);

    if (isTile) {
      const tile = TILE_COLORS[h % TILE_COLORS.length];
      return { fontSize, rotationDeg, background: tile.bg, color: tile.fg,
               fontWeight: '700', borderRadius: '3px', px: 7, py: 3 };
    }

    const hue = (h % 260) + 20;
    return {
      fontSize, rotationDeg,
      background: 'transparent',
      color: `hsl(${hue}, 60%, ${n > 0.5 ? 28 : 42}%)`,
      fontWeight: n > 0.65 ? '700' : n > 0.3 ? '500' : '400',
      borderRadius: '3px', px: 4, py: 2,
    };
  };

  // Spiral layout — recomputed only when words change
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const layout = useMemo(() => {
    const items = words
      .slice(0, 120) // cap for performance
      .map(({ word, frequency }) => ({ word, frequency, ...getWordMeta(word, frequency) }));
    return buildCloudLayout(items);
  // words identity change is the right dependency; getWordMeta is pure & stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{
        position: 'relative',
        width: layout.totalW,
        height: layout.totalH,
        margin: '0 auto',
        maxWidth: '100%',
      }}>
        {layout.items.map(({ word, frequency, x, y, fontSize, rotationDeg,
                             background, color, fontWeight, borderRadius, px, py }) => (
          <span
            key={word}
            title={`${word}: ${frequency}`}
            onClick={() => onWordClick?.(word)}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              fontSize,
              transform: `rotate(${rotationDeg}deg)`,
              transformOrigin: 'center center',
              background,
              color,
              fontWeight,
              borderRadius,
              padding: `${py}px ${px}px`,
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              userSelect: 'none',
              cursor: onWordClick ? 'pointer' : 'default',
              transition: 'opacity 0.15s, filter 0.15s',
            }}
            onMouseEnter={e => { if (onWordClick) { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.filter = 'brightness(1.2)'; } }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.filter = 'none'; }}
          >
            {word}
          </span>
        ))}
      </div>
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

function TopicsTagCloud({ submissionId, topics, sentences, forcedPathQuery, readTopics, onToggleRead, markup, onShowInArticle }) {
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
      let queryStr = '';
      if (forcedPathQuery) {
        queryStr = forcedPathQuery;
      } else {
        const params = new URLSearchParams();
        path.forEach(seg => params.append('path', seg));
        queryStr = params.toString();
      }
      const res = await fetch(
        `/api/submission/${submissionId}/word-cloud?${queryStr}`
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
  }, [submissionId, forcedPathQuery]);

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
    <div className="topics-tag-cloud-root" style={{ padding: '2px' }}>
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
        <div style={{ marginBottom: '32px', background: '#fafafa', borderRadius: '10px', padding: '16px 8px 8px' }}>
          <div style={{ marginBottom: '4px', fontSize: '14px', fontWeight: '600', color: '#444', paddingLeft: '8px' }}>
            {isRoot ? 'Topic categories' : `Sub-topics of "${navPath[navPath.length - 1]}"`}
            <span style={{ fontSize: '12px', fontWeight: '400', color: '#888', marginLeft: '8px' }}>
              — click to explore
            </span>
          </div>
          <WordCloudDisplay words={topicWords} onWordClick={handleTopicClick} />
        </div>
      )}

      {/* Sentence word cloud (from backend) */}
      <div style={{ background: '#fafafa', borderRadius: '10px', padding: '16px 8px 8px' }}>
          <div style={{ marginBottom: '4px', fontSize: '14px', fontWeight: '600', color: '#444', paddingLeft: '8px' }}>
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
            minHeight: '100px',
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

      {/* Modal for selected keyword sentences */}
      {selectedKeyword && (
        <TopicSentencesModal
          topic={{
            name: selectedKeyword,
            displayName: selectedKeyword,
            sentenceIndices: keywordSentences.map(({ index }) => index),
          }}
          sentences={sentences}
          onClose={() => setSelectedKeyword(null)}
          readTopics={readTopics}
          onToggleRead={onToggleRead}
          markup={markup}
          onShowInArticle={onShowInArticle}
        />
      )}
    </div>
  );
}

export default TopicsTagCloud;
