import React, { useEffect, useMemo, useRef } from "react";
import { buildArticleWordCloud } from "../../utils/wordCloud";

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
 *   onWordSelect?: (lemma: string) => void,
 *   onWordsComputed: (lemmaToRanges: Map<string, Array<{start: number, end: number}>>) => void,
 *   onSizeChange?: (size: {width: number, height: number}) => void,
 *   selectedLemma?: string | null,
 *   cloudRef?: React.RefObject<HTMLDivElement>,
 * }} props
 */
export default function CanvasTagsCloud({
  articleText,
  articleHeight,
  scale,
  onWordHoverChange,
  onWordSelect,
  onWordsComputed,
  onSizeChange,
  selectedLemma,
  cloudRef,
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
  }, [words, articleHeight]);

  const zoomFactor = Math.max(1, 1 / (scale || 1));
  const outerWidth = layout.totalW + 32;
  const outerHeight = layout.totalH + 32;

  const onSizeChangeRef = useRef(onSizeChange);
  useEffect(() => {
    onSizeChangeRef.current = onSizeChange;
  }, [onSizeChange]);

  useEffect(() => {
    onSizeChangeRef.current?.({ width: outerWidth, height: outerHeight });
  }, [outerWidth, outerHeight]);

  if (layout.items.length === 0) return null;

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
          transform: `scale(${zoomFactor})`,
          transformOrigin: "top right",
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
    </div>
  );
}
