import React, { useState, useMemo } from 'react';
import FullScreenGraph from './FullScreenGraph';
import '../styles/App.css';
import { getTopicHighlightColor } from '../utils/topicColorUtils';
import {
  buildHierarchy,
  segmentIsLeaf,
  buildTopTags,
  truncateWithEllipsis,
  getFirstScopedSentence,
} from '../utils/gridUtils';
import TileGrid from './grid/TileGrid';
import SummaryBackground from './grid/SummaryBackground';
import ArticleMinimap from './grid/ArticleMinimap';
import SentenceList from './grid/SentenceList';

function Breadcrumb({ path, onNavigate }) {
  return (
    <div className="grid-view-breadcrumb" aria-label="Grid navigation">
      <button
        type="button"
        className="grid-view-breadcrumb-item grid-view-breadcrumb-link"
        onClick={() => onNavigate([])}
      >
        Home
      </button>
      {path.map((segment, i) => (
        <React.Fragment key={i}>
          <span className="grid-view-breadcrumb-separator">&gt;</span>
          <button
            type="button"
            className={`grid-view-breadcrumb-item ${i < path.length - 1 ? 'grid-view-breadcrumb-link' : 'grid-view-breadcrumb-current'}`}
            onClick={() => i < path.length - 1 ? onNavigate(path.slice(0, i + 1)) : undefined}
            disabled={i === path.length - 1}
          >
            {segment}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

const TILE_GRID_COLS = 2;

function GridView({ topics, topicSummaries, sentences, onClose, readTopics, _onToggleRead, _markup }) {
  const [currentPath, setCurrentPath] = useState([]);

  const safeReadTopics = useMemo(
    () => (readTopics instanceof Set ? readTopics : new Set(readTopics || [])),
    [readTopics]
  );

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
      const minimapSentenceStates = allHighlightedIndices.map((sentenceIndex) => ({
        isActive: true,
        color: getTopicHighlightColor(currentKey || 'article-minimap'),
        sentenceIndex,
      }));
      const minimapStateByIndex = sentences.map((_, index) => {
        const match = minimapSentenceStates.find((state) => state.sentenceIndex === index + 1);
        return match ? { isActive: true, color: match.color } : null;
      });

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
              <div className="grid-view-leaf-minimap-header">
                <div className="grid-view-leaf-minimap-title">Article Minimap</div>
                <div className="grid-view-leaf-minimap-subtitle">
                  {allHighlightedIndices.length} highlighted sentences in full article
                </div>
              </div>
              <ArticleMinimap
                sentences={sentences}
                sentenceStates={minimapStateByIndex}
              />
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
      const isRead = safeReadTopics.has(fullPath);
      return {
        label: segment,
        previewLabel,
        previewText,
        tags: buildTopTags(data.topics, sentences),
        topicCount: data.topics.length,
        sentenceCount: data.sentenceCount,
        segment,
        isLeaf,
        isRead,
        fullPath,
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
        const isRead = safeReadTopics.has(fullPath);
        return {
          label: item.label,
          summary,
          isRead,
          fullPath,
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
          const isRead = safeReadTopics.has(fullPath);
          return {
            label: segment,
            previewLabel,
            previewText,
            tags: buildTopTags(data.topics, sentences),
            topicCount: data.topics.length,
            sentenceCount: data.sentenceCount,
            isRead,
            fullPath,
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
