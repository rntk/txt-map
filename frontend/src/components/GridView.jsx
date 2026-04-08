import React, { useState, useMemo } from "react";
import FullScreenGraph from "./FullScreenGraph";
import "../styles/App.css";
import {
  buildHierarchy,
  segmentIsLeaf,
  buildTopTags,
  truncateWithEllipsis,
  getFirstScopedSentence,
} from "../utils/gridUtils";
import TileGrid from "./grid/TileGrid";
import SummaryBackground from "./grid/SummaryBackground";
import TopicSentencesModal from "./shared/TopicSentencesModal";

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
            className={`grid-view-breadcrumb-item ${i < path.length - 1 ? "grid-view-breadcrumb-link" : "grid-view-breadcrumb-current"}`}
            onClick={() =>
              i < path.length - 1 ? onNavigate(path.slice(0, i + 1)) : undefined
            }
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

function GridView({
  topics,
  topicSummaries,
  sentences,
  onClose,
  readTopics,
  onToggleRead,
  markup,
  onShowInArticle,
}) {
  const [currentPath, setCurrentPath] = useState([]);
  const [selectedLeafTopic, setSelectedLeafTopic] = useState(null);

  const safeReadTopics = useMemo(
    () => (readTopics instanceof Set ? readTopics : new Set(readTopics || [])),
    [readTopics],
  );

  const hierarchy = useMemo(
    () => buildHierarchy(topics, currentPath),
    [topics, currentPath],
  );

  const handleNavigate = (newPath) => {
    setCurrentPath(newPath);
  };

  const handleTileClick = (item) => {
    if (item.isLeaf) {
      // For leaf tiles, show the TopicSentencesModal instead of navigating
      const leafTopic = topics.find((t) => t.name === item.fullPath);
      if (leafTopic) {
        setSelectedLeafTopic({
          name: item.fullPath,
          displayName: item.label,
          sentenceIndices: leafTopic.sentences || [],
        });
      }
    } else if (item.segment !== undefined) {
      setCurrentPath((prev) => [...prev, item.segment]);
    }
  };

  const handleCloseLeafModal = () => {
    setSelectedLeafTopic(null);
  };

  const renderContent = () => {
    // ── Topic tiles view ─────────────────────────────────────────────────────
    const foregroundItems = Array.from(hierarchy.entries()).map(
      ([segment, data]) => {
        const isLeaf = segmentIsLeaf(topics, currentPath, segment);
        const tilePath = [...currentPath, segment];
        const fullPath = tilePath.join(">");
        const summary = topicSummaries[fullPath] || "";
        const fallbackSentence = getFirstScopedSentence(data.topics, sentences);
        const previewText = truncateWithEllipsis(
          summary || fallbackSentence,
          150,
        );
        const previewLabel = summary ? "Summary" : "";
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
      },
    );

    // Determine if ALL foreground tiles are leaf topics
    const allLeaves = foregroundItems.every((item) => item.isLeaf);

    let backgroundItems = [];

    if (allLeaves) {
      // Background: summary tiles for each leaf topic
      backgroundItems = foregroundItems.map((item) => {
        const fullPath =
          currentPath.length > 0
            ? [...currentPath, item.segment].join(">")
            : item.segment;
        const summary = topicSummaries[fullPath] || "";
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
      const firstNonLeaf = foregroundItems.find((item) => !item.isLeaf);
      if (firstNonLeaf) {
        const nextPath = [...currentPath, firstNonLeaf.segment];
        const nextHierarchy = buildHierarchy(topics, nextPath);
        backgroundItems = Array.from(nextHierarchy.entries()).map(
          ([segment, data]) => {
            const tilePath = [...nextPath, segment];
            const fullPath = tilePath.join(">");
            const summary = topicSummaries[fullPath] || "";
            const fallbackSentence = getFirstScopedSentence(
              data.topics,
              sentences,
            );
            const previewText = truncateWithEllipsis(
              summary || fallbackSentence,
              150,
            );
            const previewLabel = summary ? "Summary" : "";
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
          },
        );
      }
    }

    return (
      <div className="grid-view-container">
        {/* Background layer */}
        {backgroundItems.length > 0 &&
          (allLeaves ? (
            <SummaryBackground items={backgroundItems} cols={TILE_GRID_COLS} />
          ) : (
            <TileGrid items={backgroundItems} isBackground={true} />
          ))}

        {/* Foreground layer */}
        <TileGrid
          items={foregroundItems}
          onTileClick={handleTileClick}
          isBackground={false}
        />
      </div>
    );
  };

  const toolbar = <Breadcrumb path={currentPath} onNavigate={handleNavigate} />;

  return (
    <>
      <FullScreenGraph onClose={onClose} title="Grid View" toolbar={toolbar}>
        {renderContent()}
      </FullScreenGraph>
      {selectedLeafTopic && (
        <TopicSentencesModal
          topic={selectedLeafTopic}
          sentences={sentences}
          onClose={handleCloseLeafModal}
          allTopics={topics}
          readTopics={safeReadTopics}
          onToggleRead={
            onToggleRead
              ? (topic) => onToggleRead(topic.primaryTopicName || topic.name)
              : undefined
          }
          onShowInArticle={onShowInArticle}
          markup={markup}
        />
      )}
    </>
  );
}

export default GridView;
