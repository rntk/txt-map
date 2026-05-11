import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildArticleWordCloud, naiveLemmatize } from "../../utils/wordCloud";

const MIN_RANKED_TAG_SCORE = 50;
const MAX_CLOUD_WORDS = 120;
const MAX_RANKED_TAGS = 60;

/**
 * @typedef {{tag: string, score: number}} TopicTagRankingEntry
 */

/**
 * Aggregates ranked tags from all topics, keeping the highest score per tag.
 *
 * @param {Record<string, Array<TopicTagRankingEntry>> | undefined} topicTagRankings
 * @returns {Array<{tag: string, lemma: string, score: number}>}
 */
function aggregateRankedTags(topicTagRankings) {
  if (!topicTagRankings || typeof topicTagRankings !== "object") {
    return [];
  }

  /** @type {Map<string, {tag: string, lemma: string, score: number}>} */
  const byLemma = new Map();
  Object.values(topicTagRankings).forEach((entries) => {
    if (!Array.isArray(entries)) return;
    entries.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const rawTag = typeof entry.tag === "string" ? entry.tag.trim() : "";
      const score = Math.max(0, Math.min(100, Math.round(Number(entry.score))));
      if (!rawTag || !Number.isFinite(score)) return;
      if (score < MIN_RANKED_TAG_SCORE) return;

      const lowerTag = rawTag.toLowerCase();
      const lemma = naiveLemmatize(lowerTag) || lowerTag;
      const existing = byLemma.get(lemma);
      if (!existing || score > existing.score) {
        byLemma.set(lemma, { tag: lowerTag, lemma, score });
      }
    });
  });

  return Array.from(byLemma.values()).sort(
    (left, right) =>
      right.score - left.score || left.tag.localeCompare(right.tag),
  );
}

function wordHash(word) {
  let hash = 0;
  for (let i = 0; i < word.length; i += 1) {
    hash = (hash * 31 + word.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

function rectOverlaps(a, placed) {
  const margin = 6;
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

function buildCloudLayout(items, maxHeight) {
  const CX = 600;
  const CY = Math.max(300, Math.floor(maxHeight / 2));
  const placed = [];
  const result = [];

  for (const item of items) {
    const { word, fontSize, rotationDeg = 0 } = item;
    const rad = Math.abs(rotationDeg) * (Math.PI / 180);
    const tw = word.length * fontSize * 0.58;
    const th = fontSize * 1.3;
    const bw = tw * Math.cos(rad) + th * Math.sin(rad) + 14;
    const bh = tw * Math.sin(rad) + th * Math.cos(rad) + 8;

    let pos = null;
    for (let step = 0; step < 1500; step += 1) {
      const angle = step * 0.31;
      const r = step * 2.3;
      const x = CX + r * Math.cos(angle) - bw / 2;
      const y = CY + r * Math.sin(angle) * 0.65 - bh / 2;
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

  const pad = 28;
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
 * @param {{
 *   articleText: string,
 *   articleHeight: number,
 *   onWordHoverChange: (lemma: string | null) => void,
 *   onWordSelect?: (lemma: string) => void,
 *   onWordsComputed: (lemmaToRanges: Map<string, Array<{start: number, end: number}>>) => void,
 *   onSizeChange?: (size: {width: number, height: number}) => void,
 *   selectedLemma?: string | null,
 *   cloudRef?: React.RefObject<HTMLDivElement>,
 *   topicTagRankings?: Record<string, Array<{tag: string, score: number}>>,
 * }} props
 */
export default function CanvasTagsCloud({
  articleText,
  articleHeight,
  onWordHoverChange,
  onWordSelect,
  onWordsComputed,
  onSizeChange,
  selectedLemma,
  cloudRef,
  topicTagRankings,
}) {
  const { words, ranges } = useMemo(
    () => buildArticleWordCloud(articleText || ""),
    [articleText],
  );

  const rankedTags = useMemo(
    () => aggregateRankedTags(topicTagRankings),
    [topicTagRankings],
  );

  const [wordLimit, setWordLimit] = useState(MAX_CLOUD_WORDS);
  const [rankedLimit, setRankedLimit] = useState(MAX_RANKED_TAGS);

  useEffect(() => {
    setWordLimit(MAX_CLOUD_WORDS);
  }, [articleText]);

  useEffect(() => {
    setRankedLimit(MAX_RANKED_TAGS);
  }, [topicTagRankings]);

  const onWordsComputedRef = useRef(onWordsComputed);
  useEffect(() => {
    onWordsComputedRef.current = onWordsComputed;
  }, [onWordsComputed]);

  useEffect(() => {
    onWordsComputedRef.current?.(ranges);
  }, [ranges]);

  const layout = useMemo(() => {
    if (words.length === 0) return { items: [], totalW: 0, totalH: 0 };

    const topWords =
      words.length > wordLimit ? words.slice(0, wordLimit) : words;
    const maxFreq = Math.max(...topWords.map((w) => w.frequency));
    const minFreq = Math.min(...topWords.map((w) => w.frequency));
    const norm = (freq) =>
      maxFreq === minFreq ? 0.5 : (freq - minFreq) / (maxFreq - minFreq);
    const getSize = (freq) => 18 + norm(freq) * 78;

    const items = topWords.map(({ word, frequency, lemma }) => {
      const h = wordHash(lemma);
      const n = norm(frequency);
      const rotationDeg = ((h % 7) - 3) * 1.6;
      const fontSize = getSize(frequency);
      const hue = (h % 260) + 20;

      return {
        word,
        lemma,
        frequency,
        fontSize,
        rotationDeg,
        color: `hsl(${hue}, 65%, ${n > 0.5 ? 75 : 60}%)`,
        fontWeight: n > 0.65 ? 700 : n > 0.3 ? 500 : 400,
      };
    });

    return buildCloudLayout(items, articleHeight || 600);
  }, [words, articleHeight, wordLimit]);

  const rankedTagItems = useMemo(() => {
    if (rankedTags.length === 0) return [];

    const visibleRanked =
      rankedTags.length > rankedLimit
        ? rankedTags.slice(0, rankedLimit)
        : rankedTags;
    const maxScore = Math.max(...visibleRanked.map((t) => t.score));
    const minScore = Math.min(...visibleRanked.map((t) => t.score));
    const norm = (score) =>
      maxScore === minScore ? 0.5 : (score - minScore) / (maxScore - minScore);

    return visibleRanked.map(({ tag, lemma, score }) => {
      const h = wordHash(lemma);
      const n = norm(score);
      const hue = (h % 260) + 20;
      return {
        tag,
        lemma,
        score,
        fontSize: 14 + n * 14,
        color: `hsl(${hue}, 65%, ${n > 0.5 ? 75 : 60}%)`,
        fontWeight: n > 0.65 ? 700 : n > 0.3 ? 500 : 400,
      };
    });
  }, [rankedTags, rankedLimit]);

  const hasMoreWords = words.length > wordLimit;
  const hasMoreRanked = rankedTags.length > rankedLimit;

  const outerWidth = layout.totalW + 32;
  const outerHeight = layout.totalH + 32;

  const onSizeChangeRef = useRef(onSizeChange);
  useEffect(() => {
    onSizeChangeRef.current = onSizeChange;
  }, [onSizeChange]);

  useEffect(() => {
    onSizeChangeRef.current?.({ width: outerWidth, height: outerHeight });
  }, [outerWidth, outerHeight]);

  if (layout.items.length === 0 && rankedTagItems.length === 0) return null;

  const handleMouseOver = (e) => {
    const el = e.target.closest?.("[data-cloud-lemma]");
    if (el) onWordHoverChange?.(el.getAttribute("data-cloud-lemma"));
  };

  const handleWordSelect = (e) => {
    const el = e.target.closest?.("[data-cloud-lemma]");
    const lemma = el?.getAttribute("data-cloud-lemma");
    if (!lemma) return;
    e.preventDefault();
    e.stopPropagation();
    onWordSelect?.(lemma);
  };

  const handleWordKeyDown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    handleWordSelect(e);
  };

  return (
    <div
      ref={cloudRef}
      className="canvas-tags-cloud"
      onMouseOver={handleMouseOver}
      onMouseLeave={() => onWordHoverChange?.(null)}
      style={{
        "--canvas-tags-cloud-width": `${outerWidth}px`,
        width: `${outerWidth}px`,
        minHeight: `${outerHeight}px`,
      }}
    >
      <div
        className="canvas-tags-cloud__inner"
        style={{
          width: `${layout.totalW}px`,
          height: `${layout.totalH}px`,
        }}
      >
        {layout.items.map((item) => (
          <button
            key={item.lemma}
            type="button"
            data-cloud-lemma={item.lemma}
            title={`${item.word}: ${item.frequency}`}
            aria-pressed={selectedLemma === item.lemma}
            className={[
              "canvas-tags-cloud__word",
              selectedLemma === item.lemma ? "is-selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={handleWordSelect}
            onKeyDown={handleWordKeyDown}
            style={{
              left: `${item.x}px`,
              top: `${item.y}px`,
              fontSize: `${item.fontSize}px`,
              fontWeight: item.fontWeight,
              transform: `rotate(${item.rotationDeg}deg)`,
              color: item.color,
            }}
          >
            {item.word}
          </button>
        ))}
      </div>
      {hasMoreWords && (
        <button
          type="button"
          className="canvas-tags-cloud__load-more"
          onClick={() =>
            setWordLimit((prev) =>
              Math.min(prev + MAX_CLOUD_WORDS, words.length),
            )
          }
        >
          Show more words ({words.length - wordLimit} hidden)
        </button>
      )}
      {rankedTagItems.length > 0 && (
        <div className="canvas-tags-cloud__ranked">
          <div className="canvas-tags-cloud__ranked-title">Scored tags</div>
          <div className="canvas-tags-cloud__ranked-list">
            {rankedTagItems.map((item) => (
              <button
                key={item.lemma}
                type="button"
                data-cloud-lemma={item.lemma}
                title={`${item.tag}: score ${item.score}`}
                aria-pressed={selectedLemma === item.lemma}
                className={[
                  "canvas-tags-cloud__ranked-item",
                  selectedLemma === item.lemma ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={handleWordSelect}
                onKeyDown={handleWordKeyDown}
                style={{
                  fontSize: `${item.fontSize}px`,
                  fontWeight: item.fontWeight,
                  color: item.color,
                }}
              >
                {item.tag}
                <span className="canvas-tags-cloud__ranked-score">
                  {item.score}
                </span>
              </button>
            ))}
          </div>
          {hasMoreRanked && (
            <button
              type="button"
              className="canvas-tags-cloud__load-more"
              onClick={() =>
                setRankedLimit((prev) =>
                  Math.min(prev + MAX_RANKED_TAGS, rankedTags.length),
                )
              }
            >
              Show more tags ({rankedTags.length - rankedLimit} hidden)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
