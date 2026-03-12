import React, { useState, useMemo } from 'react';
import FullScreenGraph from './FullScreenGraph';
import '../styles/App.css';

const buildHierarchy = (topics, path) => {
  const prefix = path.length > 0 ? path.join('>') + '>' : '';
  const matching = topics.filter(t =>
    path.length === 0 || t.name.startsWith(prefix)
  );
  const nextSegments = new Map();
  matching.forEach(topic => {
    const rest = path.length === 0 ? topic.name : topic.name.slice(prefix.length);
    const segment = rest.split('>')[0]?.trim();
    if (!segment) return;
    if (!nextSegments.has(segment)) {
      nextSegments.set(segment, { topics: [], sentenceCount: 0 });
    }
    const entry = nextSegments.get(segment);
    entry.topics.push(topic);
    entry.sentenceCount += topic.sentences?.length || 0;
  });
  return nextSegments;
};

// A segment is a leaf if the full path has an exact topic match and no sub-topics
const segmentIsLeaf = (topics, currentPath, segment) => {
  const fullPath = currentPath.length > 0
    ? [...currentPath, segment].join('>')
    : segment;
  const exactMatch = topics.some(t => t.name === fullPath);
  const hasChildren = topics.some(t => t.name.startsWith(fullPath + '>'));
  return exactMatch && !hasChildren;
};

const TILE_GRID_COLS = 2;

const COMMON_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'itself', 'me', 'my', 'of', 'on', 'or', 'our', 'ours',
  'she', 'so', 'that', 'the', 'their', 'theirs', 'them', 'they', 'this', 'those',
  'to', 'too', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who',
  'will', 'with', 'you', 'your', 'yours'
]);

const tokenizeSentence = (sentence) => {
  const text = String(sentence || '').toLowerCase();
  if (!text) return [];

  // Prefer locale-aware segmentation so tags work for non-ASCII languages too.
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    return Array.from(segmenter.segment(text))
      .filter((part) => part.isWordLike)
      .map((part) => part.segment.replace(/^['-]+|['-]+$/g, ''))
      .filter(Boolean);
  }

  return text
    .match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
};

const collectScopedSentences = (segmentTopics, allSentences) => {
  const sentenceCount = allSentences?.length || 0;
  if (sentenceCount === 0) return [];

  const rawIndices = [];
  segmentTopics.forEach((topic) => {
    (topic.sentences || []).forEach((idx) => {
      const num = Number(idx);
      if (Number.isInteger(num)) rawIndices.push(num);
    });
  });

  if (rawIndices.length === 0) return [];

  const resolveByMode = (assumeZeroBased) => {
    const texts = [];
    const seen = new Set();
    rawIndices.forEach((idx) => {
      const zeroBasedIdx = assumeZeroBased ? idx : idx - 1;
      if (zeroBasedIdx < 0 || zeroBasedIdx >= sentenceCount) return;
      if (seen.has(zeroBasedIdx)) return;
      seen.add(zeroBasedIdx);
      const sentence = allSentences[zeroBasedIdx];
      if (sentence) texts.push(sentence);
    });
    return texts;
  };

  // Primary mode: 1-based indices. If it resolves nothing, fall back to 0-based.
  const oneBased = resolveByMode(false);
  return oneBased.length > 0 ? oneBased : resolveByMode(true);
};

const buildTopTags = (segmentTopics, allSentences, limit = 20) => {
  const frequencies = new Map();
  const scopedSentences = collectScopedSentences(segmentTopics, allSentences);

  // Tags are extracted strictly from sentence text (never from topic/subtopic labels).
  scopedSentences.forEach((sentence) => {
    const words = tokenizeSentence(sentence);
    words.forEach((word) => {
      const normalized = word.replace(/^'+|'+$/g, '');
      const isAsciiToken = /^[a-z0-9]+$/i.test(normalized);
      if (isAsciiToken && normalized.length < 2) return;
      if (COMMON_STOP_WORDS.has(normalized)) return;
      frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
    });
  });

  // Fallback: if strict filters remove everything but sentences exist,
  // still build a cloud from sentence tokens.
  if (frequencies.size === 0 && scopedSentences.length > 0) {
    scopedSentences.forEach((sentence) => {
      tokenizeSentence(sentence).forEach((word) => {
        const normalized = word.replace(/^'+|'+$/g, '');
        if (!normalized) return;
        frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
      });
    });
  }

  const topTags = Array.from(frequencies.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);

  if (topTags.length === 0) return [];

  const minFrequency = topTags[topTags.length - 1][1];
  const maxFrequency = topTags[0][1];
  const minFontSize = 11;
  const maxFontSize = 22;

  return topTags.map(([label, count]) => {
    const ratio = maxFrequency === minFrequency
      ? 0.5
      : (count - minFrequency) / (maxFrequency - minFrequency);
    const fontSize = minFontSize + ratio * (maxFontSize - minFontSize);
    return { label, count, fontSize };
  });
};

const truncateWithEllipsis = (text, maxChars) => {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars).trimEnd() + '...';
};

const getFirstScopedSentence = (segmentTopics, sentences) => {
  const scopedSentences = collectScopedSentences(segmentTopics, sentences);
  return scopedSentences[0] || '';
};

function Breadcrumb({ path, onNavigate }) {
  return (
    <div className="grid-view-breadcrumb">
      <span
        className="grid-view-breadcrumb-item grid-view-breadcrumb-link"
        onClick={() => onNavigate([])}
      >
        Home
      </span>
      {path.map((segment, i) => (
        <React.Fragment key={i}>
          <span className="grid-view-breadcrumb-separator">&gt;</span>
          <span
            className={`grid-view-breadcrumb-item ${i < path.length - 1 ? 'grid-view-breadcrumb-link' : 'grid-view-breadcrumb-current'}`}
            onClick={() => i < path.length - 1 ? onNavigate(path.slice(0, i + 1)) : null}
          >
            {segment}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function TileGrid({ items, onTileClick, isBackground }) {
  return (
    <div className={isBackground ? 'grid-view-background' : 'grid-view-foreground'}>
      <div
        className="grid-view-tiles"
        style={{ gridTemplateColumns: `repeat(${TILE_GRID_COLS}, 1fr)` }}
      >
        {items.map((item, i) => (
          <div
            key={item.label + i}
            className={`grid-view-tile ${isBackground ? '' : 'grid-view-tile-interactive'}`}
            onClick={!isBackground && onTileClick ? () => onTileClick(item) : undefined}
          >
            <div className="grid-view-tile-subtiles">
              <div className="grid-view-subtile grid-view-subtile-title">
                <div className="grid-view-tile-label">{item.label}</div>
                {item.previewLabel && (
                  <div className="grid-view-tile-preview-label">{item.previewLabel}</div>
                )}
                {item.previewText && (
                  <div className="grid-view-tile-preview">
                    {item.previewText}
                  </div>
                )}
              </div>
              <div className="grid-view-subtile grid-view-subtile-tags">
                {item.tags && item.tags.length > 0 ? (
                  <div className="grid-view-tags-cloud">
                    {item.tags.map((tag) => (
                      <span
                        key={tag.label}
                        className="grid-view-tag-chip"
                        style={{ fontSize: `${tag.fontSize.toFixed(1)}px` }}
                        title={`Frequency: ${tag.count}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="grid-view-tags-empty">No tags</div>
                )}
              </div>
              <div className="grid-view-subtile grid-view-subtile-stat">
                <div className="grid-view-subtile-stat-value">{item.topicCount ?? 0}</div>
                <div className="grid-view-subtile-stat-label">Topics</div>
              </div>
              <div className="grid-view-subtile grid-view-subtile-stat">
                <div className="grid-view-subtile-stat-value">{item.sentenceCount ?? 0}</div>
                <div className="grid-view-subtile-stat-label">Sentences</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryBackground({ items, cols }) {
  return (
    <div className="grid-view-background">
      <div
        className="grid-view-tiles"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {items.map((item, i) => (
          <div key={item.label + i} className="grid-view-tile grid-view-tile-summary-bg">
            <div className="grid-view-tile-label">{item.label}</div>
            {item.summary && (
              <div className="grid-view-tile-summary-text">{item.summary}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ArticleMinimap({ sentences, highlightedIndices }) {
  const highlightSet = useMemo(() => new Set(highlightedIndices), [highlightedIndices]);

  // Use sentence length to derive a text-line width for a realistic document feel.
  const maxLen = useMemo(() => Math.max(...sentences.map(s => s.length), 1), [sentences]);

  const minimapRows = useMemo(() => {
    return sentences.flatMap((sentence, sentenceIdx) => {
      const baseWidth = Math.round(52 + (sentence.length / maxLen) * 44);
      const lineCount = Math.max(2, Math.min(8, Math.ceil(sentence.length / 24)));
      const paragraphBreak = sentenceIdx > 0 && sentenceIdx % 6 === 0;

      return Array.from({ length: lineCount }, (_, lineIdx) => {
        const tailDrop = lineIdx === lineCount - 1 ? 16 : 0;
        const steppedDrop = lineIdx * 5;
        const rhythmOffset = ((sentenceIdx + lineIdx) % 3) * 2;
        const widthPct = Math.max(30, Math.min(98, baseWidth - steppedDrop - tailDrop + rhythmOffset));
        return {
          key: `${sentenceIdx}-${lineIdx}`,
          paragraphBreak: paragraphBreak && lineIdx === 0,
          widthPct,
          isHighlight: highlightSet.has(sentenceIdx + 1),
          isContinuation: lineIdx > 0,
        };
      });
    });
  }, [sentences, maxLen, highlightSet]);

  return (
    <div className="grid-view-minimap">
      {minimapRows.map((row) => {
        const highlightClass = row.isHighlight
          ? (row.isContinuation ? ' grid-view-minimap-bar--highlight-soft' : ' grid-view-minimap-bar--highlight')
          : '';
        return (
          <div
            key={row.key}
            className={`grid-view-minimap-row${row.paragraphBreak ? ' grid-view-minimap-row--break' : ''}`}
          >
            <div
              className={`grid-view-minimap-bar${highlightClass}`}
              style={{ width: `${row.widthPct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function SentenceList({ sentenceIndices, sentences }) {
  return (
    <div className="grid-view-sentences">
      {sentenceIndices.map((idx, i) => {
        const sentence = sentences[idx - 1];
        if (!sentence) return null;
        return (
          <div key={i} className="grid-view-sentence-item">
            <span className="grid-view-sentence-num">{idx}</span>
            <span>{sentence}</span>
          </div>
        );
      })}
    </div>
  );
}

function GridView({ topics, topicSummaries, sentences, onClose }) {
  const [currentPath, setCurrentPath] = useState([]);

  const currentKey = currentPath.length > 0 ? currentPath.join('>') : '';

  const hierarchy = useMemo(
    () => buildHierarchy(topics, currentPath),
    [topics, currentPath]
  );

  const matchingTopics = useMemo(() => {
    if (currentPath.length === 0) return topics;
    const prefix = currentPath.join('>');
    return topics.filter(t => t.name === prefix || t.name.startsWith(prefix + '>'));
  }, [topics, currentPath]);

  const allHighlightedIndices = useMemo(() => {
    const indices = new Set();
    matchingTopics.forEach(t => {
      (t.sentences || []).forEach(idx => indices.add(idx));
    });
    return Array.from(indices).sort((a, b) => a - b);
  }, [matchingTopics]);

  const handleNavigate = (newPath) => {
    setCurrentPath(newPath);
  };

  const handleTileClick = (item) => {
    if (item.segment !== undefined) {
      setCurrentPath(prev => [...prev, item.segment]);
    }
  };

  const renderContent = () => {
    // ── Leaf / sentence view ──────────────────────────────────────────────────
    // Triggered when we've drilled all the way into a single leaf topic
    // (no more sub-segments from current path)
    const hasSubSegments = hierarchy.size > 0;
    if (!hasSubSegments) {
      const leafSummary = currentKey ? topicSummaries[currentKey] : null;

      return (
        <div className="grid-view-container grid-view-container--leaf">
          <div className="grid-view-leaf-layout">
            <div className="grid-view-leaf-main">
              {leafSummary && (
                <div className="grid-view-summary-block">
                  <h3>Summary</h3>
                  <p>{leafSummary}</p>
                </div>
              )}
              <SentenceList sentenceIndices={allHighlightedIndices} sentences={sentences} />
            </div>
            <div className="grid-view-leaf-minimap-panel">
              <div className="grid-view-leaf-minimap-title">
                Article Minimap
              </div>
              <div className="grid-view-leaf-minimap-subtitle">
                {allHighlightedIndices.length} highlighted sentences in full article
              </div>
              <ArticleMinimap sentences={sentences} highlightedIndices={allHighlightedIndices} />
            </div>
          </div>
        </div>
      );
    }

    // ── Topic tiles view (intermediate + leaf-parent levels) ─────────────────
    const foregroundItems = Array.from(hierarchy.entries()).map(([segment, data]) => {
      const isLeaf = segmentIsLeaf(topics, currentPath, segment);
      const tilePath = [...currentPath, segment];
      const fullPath = tilePath.join('>');
      const summary = topicSummaries[fullPath] || '';
      const fallbackSentence = getFirstScopedSentence(data.topics, sentences);
      const previewText = truncateWithEllipsis(summary || fallbackSentence, 150);
      const previewLabel = summary ? 'Summary' : '';
      return {
        label: segment,
        previewLabel,
        previewText,
        tags: buildTopTags(data.topics, sentences),
        topicCount: data.topics.length,
        sentenceCount: data.sentenceCount,
        segment,
        isLeaf,
      };
    });

    // Determine if ALL foreground tiles are leaf topics
    const allLeaves = foregroundItems.every(item => item.isLeaf);

    let backgroundItems = [];

    if (allLeaves) {
      // Background: summary tiles for each leaf topic
      backgroundItems = foregroundItems.map(item => {
        const fullPath = currentPath.length > 0
          ? [...currentPath, item.segment].join('>')
          : item.segment;
        const summary = topicSummaries[fullPath] || '';
        return {
          label: item.label,
          summary,
        };
      });
    } else {
      // Background: next-level preview from the first non-leaf foreground tile
      const firstNonLeaf = foregroundItems.find(item => !item.isLeaf);
      if (firstNonLeaf) {
        const nextPath = [...currentPath, firstNonLeaf.segment];
        const nextHierarchy = buildHierarchy(topics, nextPath);
        backgroundItems = Array.from(nextHierarchy.entries()).map(([segment, data]) => {
          const tilePath = [...nextPath, segment];
          const fullPath = tilePath.join('>');
          const summary = topicSummaries[fullPath] || '';
          const fallbackSentence = getFirstScopedSentence(data.topics, sentences);
          const previewText = truncateWithEllipsis(summary || fallbackSentence, 150);
          const previewLabel = summary ? 'Summary' : '';
          return {
            label: segment,
            previewLabel,
            previewText,
            tags: buildTopTags(data.topics, sentences),
            topicCount: data.topics.length,
            sentenceCount: data.sentenceCount,
          };
        });
      }
    }

    return (
      <div className="grid-view-container">
        {/* Background layer */}
        {backgroundItems.length > 0 && (
          allLeaves ? (
            <SummaryBackground
              items={backgroundItems}
              cols={TILE_GRID_COLS}
            />
          ) : (
            <TileGrid
              items={backgroundItems}
              isBackground={true}
            />
          )
        )}

        {/* Foreground layer */}
        <TileGrid
          items={foregroundItems}
          onTileClick={handleTileClick}
          isBackground={false}
        />
      </div>
    );
  };

  const toolbar = (
    <Breadcrumb path={currentPath} onNavigate={handleNavigate} />
  );

  return (
    <FullScreenGraph onClose={onClose} title="Grid View" toolbar={toolbar}>
      {renderContent()}
    </FullScreenGraph>
  );
}

export default GridView;
