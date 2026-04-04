import React, { useMemo } from "react";

function stripHtml(html) {
  try {
    return (
      new DOMParser().parseFromString(html, "text/html").body.textContent || ""
    );
  } catch {
    return html.replace(/<[^>]+>/g, "");
  }
}

function GroupedByTopicsView({
  topics,
  rawHtml,
  sentences,
  isRawTextMode,
  highlightedTopicName,
}) {
  const sortedTopics = useMemo(() => {
    if (!Array.isArray(topics) || topics.length === 0) return [];

    return [...topics].sort((a, b) => {
      const aRanges = Array.isArray(a.ranges) ? a.ranges : [];
      const bRanges = Array.isArray(b.ranges) ? b.ranges : [];

      const aMin =
        aRanges.length > 0
          ? Math.min(...aRanges.map((r) => Number(r.start)))
          : Array.isArray(a.sentences) && a.sentences.length > 0
            ? Math.min(...a.sentences)
            : Infinity;

      const bMin =
        bRanges.length > 0
          ? Math.min(...bRanges.map((r) => Number(r.start)))
          : Array.isArray(b.sentences) && b.sentences.length > 0
            ? Math.min(...b.sentences)
            : Infinity;

      return aMin - bMin;
    });
  }, [topics]);

  if (sortedTopics.length === 0) {
    return <div className="grouped-topics-empty">No topics available.</div>;
  }

  return (
    <div className="grouped-topics-list">
      {sortedTopics.map((topic) => {
        const ranges = Array.isArray(topic.ranges) ? topic.ranges : [];
        let extractedText = "";

        if (ranges.length > 0 && rawHtml) {
          const fragments = ranges
            .map((r) => {
              const start = Number(r.start);
              const end = Number(r.end);
              if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
              return rawHtml.slice(start, end);
            })
            .filter((f) => f.length > 0);

          const joined = fragments.join(" \u2026 ");
          extractedText = isRawTextMode ? joined : stripHtml(joined);
        } else if (
          Array.isArray(topic.sentences) &&
          topic.sentences.length > 0 &&
          Array.isArray(sentences)
        ) {
          const frags = topic.sentences
            .map((idx) => sentences[idx - 1])
            .filter((s) => s != null && s !== "");
          extractedText = frags.join(" ");
        }

        const isHighlighted = highlightedTopicName === topic.name;
        return (
          <div
            key={topic.name}
            id={`grouped-topic-${topic.name}`}
            className={`grouped-topic-section${isHighlighted ? " grouped-topic-highlight" : ""}`}
          >
            <div className="grouped-topic-title">{topic.name}</div>
            {isRawTextMode ? (
              <pre className="grouped-topic-text raw">
                {extractedText || "(no text)"}
              </pre>
            ) : (
              <div className="grouped-topic-text">
                {extractedText || "(no text)"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(GroupedByTopicsView);
