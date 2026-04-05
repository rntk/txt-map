import React, { useState, useMemo, useEffect, useCallback } from "react";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import { buildModalSelectionFromKeyword } from "../utils/topicModalSelection";
import "./TopicNavigation.css";

/**
 * @typedef {Object} TopicTagCloudTopic
 * @property {string} name
 * @property {Array<number>} [sentences]
 *
 * @typedef {Object} TopicTagCloudProps
 * @property {string | number} submissionId
 * @property {Array<TopicTagCloudTopic>} topics
 * @property {Array<string>} sentences
 * @property {string} [forcedPathQuery]
 * @property {Set<string> | Iterable<string>} [readTopics]
 * @property {(topic: TopicTagCloudTopic) => void} [onToggleRead]
 * @property {unknown} [markup]
 * @property {(topic: TopicTagCloudTopic) => void} [onShowInArticle]
 */

function wordHash(word) {
  let hash = 0;
  for (let i = 0; i < word.length; i += 1) {
    hash = (hash * 31 + word.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

const TILE_COLORS = [
  { bg: "#ffd740", fg: "#333" },
  { bg: "#69f0ae", fg: "#1b5e20" },
  { bg: "#40c4ff", fg: "#01579b" },
  { bg: "#ff6e40", fg: "#fff" },
  { bg: "#e040fb", fg: "#fff" },
  { bg: "#b2ff59", fg: "#33691e" },
];

function rectOverlaps(a, placed) {
  const margin = 5;
  for (const b of placed) {
    if (
      a.x < b.x + b.w + margin &&
      a.x + a.w > b.x - margin &&
      a.y < b.y + b.h + margin &&
      a.y + a.h > b.y - margin
    ) {
      return true;
    }
  }
  return false;
}

function buildCloudLayout(items) {
  const CX = 460;
  const CY = 260;
  const placed = [];
  const result = [];

  for (const item of items) {
    const { word, fontSize, rotationDeg = 0 } = item;
    const rad = Math.abs(rotationDeg) * (Math.PI / 180);
    const tw = word.length * fontSize * 0.56;
    const th = fontSize * 1.3;
    const bw = tw * Math.cos(rad) + th * Math.sin(rad) + 10;
    const bh = tw * Math.sin(rad) + th * Math.cos(rad) + 6;

    let pos = null;
    for (let step = 0; step < 4000; step += 1) {
      const angle = step * 0.31;
      const r = step * 1.9;
      const x = CX + r * Math.cos(angle) - bw / 2;
      const y = CY + r * Math.sin(angle) * 0.45 - bh / 2;
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
  const minX = Math.min(...result.map((r) => r.x));
  const minY = Math.min(...result.map((r) => r.y));
  const maxX = Math.max(...result.map((r) => r.x + r.bw));
  const maxY = Math.max(...result.map((r) => r.y + r.bh));

  return {
    items: result.map((r) => ({
      ...r,
      x: r.x - minX + pad,
      y: r.y - minY + pad,
    })),
    totalW: maxX - minX + pad * 2,
    totalH: maxY - minY + pad * 2,
  };
}

/**
 * @param {{ words: Array<{ word: string, frequency: number }>, onWordClick?: (word: string) => void, emptyMessage?: string }} props
 * @returns {React.ReactElement}
 */
function WordCloudDisplay({
  words,
  onWordClick,
  emptyMessage = "No data available.",
}) {
  const layout = useMemo(() => {
    if (!words || words.length === 0) {
      return { items: [], totalW: 0, totalH: 0 };
    }

    const maxFreq = Math.max(...words.map((word) => word.frequency));
    const minFreq = Math.min(...words.map((word) => word.frequency));
    const norm = (freq) =>
      maxFreq === minFreq ? 0.5 : (freq - minFreq) / (maxFreq - minFreq);
    const getSize = (freq) => 11 + norm(freq) * 41;

    const items = words.slice(0, 120).map(({ word, frequency }) => {
      const h = wordHash(word);
      const n = norm(frequency);
      const isTile = n > 0.55 && h % 3 === 0;
      const rotationDeg = ((h % 7) - 3) * 1.8;
      const fontSize = getSize(frequency);

      if (isTile) {
        const tile = TILE_COLORS[h % TILE_COLORS.length];
        return {
          word,
          frequency,
          fontSize,
          rotationDeg,
          background: tile.bg,
          color: tile.fg,
          fontWeight: "700",
          borderRadius: "3px",
          px: 7,
          py: 3,
          isTile: true,
        };
      }

      const hue = (h % 260) + 20;
      return {
        word,
        frequency,
        fontSize,
        rotationDeg,
        background: "transparent",
        color: `hsl(${hue}, 60%, ${n > 0.5 ? 28 : 42}%)`,
        fontWeight: n > 0.65 ? "700" : n > 0.3 ? "500" : "400",
        borderRadius: "3px",
        px: 4,
        py: 2,
        isTile: false,
      };
    });

    return buildCloudLayout(items);
  }, [words]);

  if (!words || words.length === 0) {
    return <div className="topics-tag-cloud__empty">{emptyMessage}</div>;
  }

  return (
    <div className="topics-tag-cloud__cloud-shell">
      <div
        className="topics-tag-cloud__cloud"
        style={{
          "--cloud-width": `${layout.totalW}px`,
          "--cloud-height": `${layout.totalH}px`,
        }}
      >
        {layout.items.map(
          ({
            word,
            frequency,
            x,
            y,
            fontSize,
            rotationDeg,
            background,
            color,
            fontWeight,
            borderRadius,
            px,
            py,
            isTile,
          }) => (
            <span
              key={word}
              title={`${word}: ${frequency}`}
              onClick={() => onWordClick?.(word)}
              className={[
                "topics-tag-cloud__word",
                onWordClick ? "topics-tag-cloud__word--clickable" : "",
                isTile
                  ? "topics-tag-cloud__word--tile"
                  : "topics-tag-cloud__word--text",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                "--word-left": `${x}px`,
                "--word-top": `${y}px`,
                "--word-font-size": `${fontSize}px`,
                "--word-rotation": `${rotationDeg}deg`,
                "--word-bg": background,
                "--word-color": color,
                "--word-weight": fontWeight,
                "--word-radius": `${borderRadius}`,
                "--word-pad-x": `${px}px`,
                "--word-pad-y": `${py}px`,
              }}
            >
              {word}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function getChildTopics(topics, navPath) {
  return topics.filter((topic) => {
    const parts = topic.name.split(">").map((segment) => segment.trim());
    if (parts.length <= navPath.length) return false;
    return navPath.every((seg, i) => parts[i] === seg);
  });
}

function buildTopicWordCloud(topics, navPath) {
  const freq = {};
  getChildTopics(topics, navPath).forEach((topic) => {
    const parts = topic.name.split(">").map((segment) => segment.trim());
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
    const parts = (name || "").split(">").map((segment) => segment.trim());
    if (parts.length < navPath.length) return false;
    return navPath.every((seg, i) => parts[i] === seg);
  };

  const indices = new Set();
  topics
    .filter((topic) => topicMatches(topic.name))
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

/**
 * Render the topic tag cloud and scoped sentence cloud.
 *
 * @param {TopicTagCloudProps} props
 * @returns {React.ReactElement}
 */
function TopicsTagCloud({
  submissionId,
  topics,
  sentences,
  forcedPathQuery,
  readTopics,
  onToggleRead,
  markup,
  onShowInArticle,
}) {
  const [navPath, setNavPath] = useState([]);
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [sentenceWords, setSentenceWords] = useState([]);
  const [sentenceCount, setSentenceCount] = useState(0);
  const [loadingCloud, setLoadingCloud] = useState(false);

  const topicWords = useMemo(
    () => buildTopicWordCloud(topics, navPath),
    [topics, navPath],
  );
  const scopedSentenceIndices = useMemo(
    () => getSentenceIndicesForPath(topics, navPath),
    [topics, navPath],
  );

  const scopedSentences = useMemo(
    () =>
      scopedSentenceIndices
        .filter((idx) => idx >= 1 && idx <= (sentences?.length || 0))
        .map((idx) => ({ index: idx, text: sentences[idx - 1] || "" })),
    [scopedSentenceIndices, sentences],
  );

  const keywordSentences = useMemo(() => {
    if (!selectedKeyword) return [];
    const safeKeyword = selectedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${safeKeyword}\\b`, "i");
    return scopedSentences.filter(({ text }) => pattern.test(text));
  }, [selectedKeyword, scopedSentences]);

  const fetchWordCloud = useCallback(
    async (path) => {
      setLoadingCloud(true);
      try {
        let queryStr = "";
        if (forcedPathQuery) {
          queryStr = forcedPathQuery;
        } else {
          const params = new URLSearchParams();
          path.forEach((seg) => params.append("path", seg));
          queryStr = params.toString();
        }
        const res = await fetch(
          `/api/submission/${submissionId}/word-cloud?${queryStr}`,
        );
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setSentenceWords(data.words || []);
        setSentenceCount(data.sentence_count || 0);
      } catch (err) {
        console.error("word-cloud fetch failed:", err);
        setSentenceWords([]);
        setSentenceCount(0);
      } finally {
        setLoadingCloud(false);
      }
    },
    [submissionId, forcedPathQuery],
  );

  useEffect(() => {
    fetchWordCloud(navPath);
  }, [fetchWordCloud, navPath]);

  useEffect(() => {
    setSelectedKeyword(null);
  }, [navPath]);

  const isRoot = navPath.length === 0;

  const handleTopicClick = (word) => setNavPath((prev) => [...prev, word]);
  const handleKeywordClick = (word) =>
    setSelectedKeyword((prev) => (prev === word ? null : word));
  const handleBack = () => setNavPath((prev) => prev.slice(0, -1));
  const handleBreadcrumbClick = (index) =>
    setNavPath(navPath.slice(0, index + 1));

  return (
    <div className="topics-tag-cloud-root">
      <div className="topics-tag-cloud__nav">
        {!isRoot && (
          <button
            type="button"
            onClick={handleBack}
            className="topic-nav-button topics-tag-cloud__back"
          >
            ← Back
          </button>
        )}

        <div className="topics-tag-cloud__breadcrumbs">
          <button
            type="button"
            className={`topics-tag-cloud__breadcrumb${isRoot ? " topics-tag-cloud__breadcrumb--current" : ""}`}
            onClick={() => !isRoot && setNavPath([])}
            disabled={isRoot}
          >
            All Topics
          </button>

          {navPath.map((seg, i) => {
            const isCurrent = i === navPath.length - 1;
            return (
              <React.Fragment key={`${seg}-${i}`}>
                <span className="topics-tag-cloud__separator">›</span>
                <button
                  type="button"
                  className={`topics-tag-cloud__breadcrumb${isCurrent ? " topics-tag-cloud__breadcrumb--current" : ""}`}
                  onClick={() =>
                    i < navPath.length - 1 && handleBreadcrumbClick(i)
                  }
                  disabled={isCurrent}
                >
                  {seg}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {topicWords.length > 0 && (
        <section className="topics-tag-cloud__panel">
          <div className="topics-tag-cloud__panel-header">
            {isRoot
              ? "Topic categories"
              : `Sub-topics of "${navPath[navPath.length - 1]}"`}
            <span className="topics-tag-cloud__panel-note">
              click to explore
            </span>
          </div>
          <WordCloudDisplay words={topicWords} onWordClick={handleTopicClick} />
        </section>
      )}

      <section className="topics-tag-cloud__panel">
        <div className="topics-tag-cloud__panel-header">
          {isRoot ? "All text" : navPath.join(" › ")} - key words
          {!loadingCloud && sentenceWords.length > 0 && (
            <span className="topics-tag-cloud__panel-note">
              click a keyword to see matching sentences
            </span>
          )}
          {!loadingCloud && (
            <span className="topics-tag-cloud__panel-note">
              from {sentenceCount} sentence{sentenceCount !== 1 ? "s" : ""}
            </span>
          )}
          {loadingCloud && (
            <span className="topics-tag-cloud__panel-note">computing…</span>
          )}
        </div>

        {loadingCloud ? (
          <div className="topics-tag-cloud__loading">Loading word cloud…</div>
        ) : (
          <WordCloudDisplay
            words={sentenceWords}
            onWordClick={handleKeywordClick}
            emptyMessage="No sentences found for this topic."
          />
        )}
      </section>

      {selectedKeyword && (
        <TopicSentencesModal
          topic={buildModalSelectionFromKeyword(
            selectedKeyword,
            keywordSentences.map(({ index }) => index),
            sentences,
          )}
          sentences={sentences}
          onClose={() => setSelectedKeyword(null)}
          allTopics={topics}
          readTopics={readTopics}
          onToggleRead={onToggleRead}
          markup={markup}
          onShowInArticle={onShowInArticle}
        />
      )}
    </div>
  );
}

export { WordCloudDisplay };
export default TopicsTagCloud;
