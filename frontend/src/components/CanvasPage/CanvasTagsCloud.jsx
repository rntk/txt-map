import React, { useEffect, useMemo, useRef } from "react";
import { buildArticleWordCloud } from "../../utils/wordCloud";

const TILE_COLORS = [
  { bg: "#ffd740", fg: "#333" },
  { bg: "#69f0ae", fg: "#1b5e20" },
  { bg: "#40c4ff", fg: "#01579b" },
  { bg: "#ff6e40", fg: "#fff" },
  { bg: "#e040fb", fg: "#fff" },
  { bg: "#b2ff59", fg: "#33691e" },
];

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
    for (let step = 0; step < 6000; step += 1) {
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
 *   scale: number,
 *   onWordHoverChange: (lemma: string | null) => void,
 *   onWordsComputed: (lemmaToRanges: Map<string, Array<{start: number, end: number}>>) => void,
 * }} props
 */
export default function CanvasTagsCloud({
  articleText,
  articleHeight,
  scale,
  onWordHoverChange,
  onWordsComputed,
}) {
  const { words, ranges } = useMemo(
    () => buildArticleWordCloud(articleText || ""),
    [articleText],
  );

  const onWordsComputedRef = useRef(onWordsComputed);
  useEffect(() => {
    onWordsComputedRef.current = onWordsComputed;
  }, [onWordsComputed]);

  useEffect(() => {
    onWordsComputedRef.current?.(ranges);
  }, [ranges]);

  const layout = useMemo(() => {
    const top = words.slice(0, 140);
    if (top.length === 0) return { items: [], totalW: 0, totalH: 0 };

    const maxFreq = Math.max(...top.map((w) => w.frequency));
    const minFreq = Math.min(...top.map((w) => w.frequency));
    const norm = (freq) =>
      maxFreq === minFreq ? 0.5 : (freq - minFreq) / (maxFreq - minFreq);
    const getSize = (freq) => 18 + norm(freq) * 78;

    const items = top.map(({ word, frequency, lemma }) => {
      const h = wordHash(lemma);
      const n = norm(frequency);
      const isTile = n > 0.55 && h % 3 === 0;
      const rotationDeg = ((h % 7) - 3) * 1.6;
      const fontSize = getSize(frequency);

      const base = { word, lemma, frequency, fontSize, rotationDeg };

      if (isTile) {
        const tile = TILE_COLORS[h % TILE_COLORS.length];
        return {
          ...base,
          background: tile.bg,
          color: tile.fg,
          fontWeight: 700,
          isTile: true,
        };
      }
      const hue = (h % 260) + 20;
      return {
        ...base,
        background: "transparent",
        color: `hsl(${hue}, 65%, ${n > 0.5 ? 75 : 60}%)`,
        fontWeight: n > 0.65 ? 700 : n > 0.3 ? 500 : 400,
        isTile: false,
      };
    });

    return buildCloudLayout(items, articleHeight || 600);
  }, [words, articleHeight]);

  if (layout.items.length === 0) return null;

  const handleMouseOver = (e) => {
    const el = e.target.closest?.("[data-cloud-lemma]");
    if (el) onWordHoverChange?.(el.getAttribute("data-cloud-lemma"));
  };

  const zoomFactor = Math.max(1, 1 / (scale || 1));

  return (
    <div
      className="canvas-tags-cloud"
      onMouseOver={handleMouseOver}
      onMouseLeave={() => onWordHoverChange?.(null)}
      style={{
        "--canvas-tags-cloud-width": `${layout.totalW * zoomFactor + 32}px`,
        width: `${layout.totalW * zoomFactor + 32}px`,
        minHeight: `${layout.totalH * zoomFactor + 32}px`,
      }}
    >
      <div
        className="canvas-tags-cloud__inner"
        style={{
          width: `${layout.totalW}px`,
          height: `${layout.totalH}px`,
          transform: `scale(${zoomFactor})`,
          transformOrigin: "top left",
        }}
      >
        {layout.items.map((item) => (
          <span
            key={item.lemma}
            data-cloud-lemma={item.lemma}
            title={`${item.word}: ${item.frequency}`}
            className={`canvas-tags-cloud__word${item.isTile ? " is-tile" : ""}`}
            style={{
              left: `${item.x}px`,
              top: `${item.y}px`,
              fontSize: `${item.fontSize}px`,
              fontWeight: item.fontWeight,
              transform: `rotate(${item.rotationDeg}deg)`,
              background: item.background,
              color: item.color,
            }}
          >
            {item.word}
          </span>
        ))}
      </div>
    </div>
  );
}
