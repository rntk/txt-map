import React, { useState, useMemo } from 'react';
import FullScreenGraph from './FullScreenGraph';
import '../styles/App.css';
import {
  buildHierarchy,
  segmentIsLeaf,
  buildTopTags,
  truncateWithEllipsis,
  getFirstScopedSentence,
} from '../utils/gridUtils';

const TILE_GRID_COLS = 2;

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
            {/* Top zone: text content */}
            <div className="grid-view-tile-content">
              <div className="grid-view-tile-label">{item.label}</div>
              {item.previewLabel && (
                <div className="grid-view-tile-preview-label">{item.previewLabel}</div>
              )}
              {item.previewText && (
                <div className="grid-view-tile-preview">{item.previewText}</div>
              )}
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
            {/* Bottom zone: stats */}
            <div className="grid-view-tile-stats">
              <div className="grid-view-tile-stat">
                <div className="grid-view-tile-stat-value">{item.topicCount ?? 0}</div>
                <div className="grid-view-tile-stat-label">Topics</div>
              </div>
              <div className="grid-view-tile-stat grid-view-tile-stat--hero">
                <div className="grid-view-tile-stat-value">{item.sentenceCount ?? 0}</div>
                <div className="grid-view-tile-stat-label">Sentences</div>
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
