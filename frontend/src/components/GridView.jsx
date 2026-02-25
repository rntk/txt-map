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

const getFontSize = (itemCount) => {
  if (itemCount === 1) return '4rem';
  if (itemCount <= 2) return '3rem';
  if (itemCount <= 4) return '2.5rem';
  if (itemCount <= 9) return '1.8rem';
  return '1.2rem';
};

const getGridCols = (itemCount) => {
  if (itemCount === 1) return 1;
  if (itemCount <= 4) return 2;
  if (itemCount <= 9) return 3;
  return 4;
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

function TileGrid({ items, onTileClick, fontSize, cols, isBackground }) {
  return (
    <div className={isBackground ? 'grid-view-background' : 'grid-view-foreground'}>
      <div
        className="grid-view-tiles"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {items.map((item, i) => (
          <div
            key={item.label + i}
            className={`grid-view-tile ${isBackground ? '' : 'grid-view-tile-interactive'}`}
            style={{ fontSize }}
            onClick={!isBackground && onTileClick ? () => onTileClick(item) : undefined}
          >
            <div className="grid-view-tile-label">{item.label}</div>
            {item.subtitle && (
              <div className="grid-view-tile-subtitle">{item.subtitle}</div>
            )}
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
      return {
        label: segment,
        subtitle: isLeaf
          ? `${data.sentenceCount} sentence${data.sentenceCount !== 1 ? 's' : ''}`
          : `${data.topics.length} topic${data.topics.length !== 1 ? 's' : ''}, ${data.sentenceCount} sentences`,
        segment,
        isLeaf,
      };
    });

    const fgCount = foregroundItems.length;

    // Determine if ALL foreground tiles are leaf topics
    const allLeaves = foregroundItems.every(item => item.isLeaf);

    let backgroundItems = [];
    let bgCount = 0;

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
      bgCount = backgroundItems.length;
    } else {
      // Background: next-level preview from the first non-leaf foreground tile
      const firstNonLeaf = foregroundItems.find(item => !item.isLeaf);
      if (firstNonLeaf) {
        const nextPath = [...currentPath, firstNonLeaf.segment];
        const nextHierarchy = buildHierarchy(topics, nextPath);
        backgroundItems = Array.from(nextHierarchy.entries()).map(([segment, data]) => ({
          label: segment,
          subtitle: `${data.sentenceCount} sentences`,
        }));
        bgCount = backgroundItems.length;
      }
    }

    return (
      <div className="grid-view-container">
        {/* Background layer */}
        {backgroundItems.length > 0 && (
          allLeaves ? (
            <SummaryBackground
              items={backgroundItems}
              cols={getGridCols(bgCount)}
            />
          ) : (
            <TileGrid
              items={backgroundItems}
              fontSize={getFontSize(bgCount)}
              cols={getGridCols(bgCount)}
              isBackground={true}
            />
          )
        )}

        {/* Foreground layer */}
        <TileGrid
          items={foregroundItems}
          onTileClick={handleTileClick}
          fontSize={getFontSize(fgCount)}
          cols={getGridCols(fgCount)}
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
