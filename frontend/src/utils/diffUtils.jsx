import React from "react";

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function similarityClass(similarity) {
  const pct = Math.round((similarity || 0) * 100);
  if (pct >= 70) return "diff-sim-high";
  if (pct >= 25) return "diff-sim-mid";
  return "diff-sim-low";
}

export function highlightText(text, query) {
  const raw = String(text || "");
  const term = String(query || "")
    .trim()
    .toLowerCase();
  if (!term) return raw;
  const idx = raw.toLowerCase().indexOf(term);
  if (idx < 0) return raw;
  return (
    <>
      {raw.slice(0, idx)}
      <mark>{raw.slice(idx, idx + term.length)}</mark>
      {raw.slice(idx + term.length)}
    </>
  );
}
