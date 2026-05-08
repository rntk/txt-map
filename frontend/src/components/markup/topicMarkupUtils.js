/**
 * @typedef {Object} TopicMarkupRange
 * @property {number} [range_index]
 * @property {number} [sentence_start]
 * @property {number} [sentence_end]
 * @property {string} [html]
 * @property {Array<object>} [segments]
 * @property {Array<object>} [positions]
 */

/**
 * Check if topicMarkup contains enriched (non-plain) segments.
 * @param {unknown} topicMarkup
 * @returns {boolean}
 */
export function hasEnrichedSegments(topicMarkup) {
  if (!topicMarkup || !Array.isArray(topicMarkup.segments)) {
    return false;
  }
  return topicMarkup.segments.some(
    (seg) => seg && typeof seg === "object" && seg.type !== "plain",
  );
}

/**
 * Build range objects from positions+segments by grouping positions
 * into contiguous ranges based on source_sentence_index adjacency.
 * @param {unknown} topicMarkup
 * @returns {Array<{ sentence_start: number, sentence_end: number, range_index: number, segments: Array<{ positions: Array<{ index: number, text: string, source_sentence_index: number }>, type: string, data: unknown }>, positions: Array<{ index: number, text: string, source_sentence_index: number }> }>}
 */
export function getEnrichedSegmentRanges(topicMarkup) {
  if (
    !topicMarkup ||
    !Array.isArray(topicMarkup.positions) ||
    !Array.isArray(topicMarkup.segments)
  ) {
    return [];
  }

  const positions = topicMarkup.positions;

  // Group positions by source_sentence_index adjacency
  const sortedPositions = [...positions]
    .filter(
      (p) =>
        p && typeof p === "object" && Number.isInteger(p.source_sentence_index),
    )
    .sort((a, b) => a.source_sentence_index - b.source_sentence_index);

  if (sortedPositions.length === 0) {
    return [];
  }

  const positionGroups = [];
  let currentGroup = [sortedPositions[0]];

  for (let i = 1; i < sortedPositions.length; i++) {
    if (
      sortedPositions[i].source_sentence_index -
        sortedPositions[i - 1].source_sentence_index <=
      1
    ) {
      currentGroup.push(sortedPositions[i]);
    } else {
      positionGroups.push(currentGroup);
      currentGroup = [sortedPositions[i]];
    }
  }
  positionGroups.push(currentGroup);

  return positionGroups.map((group, idx) => {
    const sentenceIndices = group.map((p) => p.source_sentence_index);
    // Build a map from position index -> 0-based sentence index
    const posToSentenceIdx = new Map();
    for (const p of group) {
      posToSentenceIdx.set(p.index, p.source_sentence_index - 1);
    }
    return {
      sentence_start: Math.min(...sentenceIndices),
      sentence_end: Math.max(...sentenceIndices),
      range_index: idx + 1,
      positions: group,
      segments: topicMarkup.segments
        .map((seg) => {
          if (!seg || !Array.isArray(seg.position_indices)) return null;
          const groupIndices = group.map((p) => p.index);
          const matchedPositionIndices = seg.position_indices.filter((pi) =>
            groupIndices.includes(pi),
          );
          if (matchedPositionIndices.length === 0) return null;
          // Convert position indices to 1-based sentence indices for rendering
          const sentenceIndices = matchedPositionIndices
            .map((pi) => posToSentenceIdx.get(pi))
            .filter((si) => si !== undefined)
            .map((si) => si + 1); // Convert 0-based to 1-based for getTextByIndex
          return {
            type: seg.type,
            position_indices: matchedPositionIndices,
            sentence_indices: sentenceIndices,
            data: {
              // Only include sentence_indices in data so QuoteMarkup uses correct indices
              ...Object.fromEntries(
                Object.entries(seg.data || {}).filter(
                  ([k]) => k !== "position_indices",
                ),
              ),
              sentence_indices: sentenceIndices,
            },
            positions: group.filter((p) =>
              matchedPositionIndices.includes(p.index),
            ),
          };
        })
        .filter(Boolean),
    };
  });
}

export function resolveTopicMarkup(markup, topic) {
  if (!markup || !topic) {
    return null;
  }

  const candidateKeys = [
    ...new Set(
      [topic.name, topic.fullPath, topic.displayName]
        .filter((key) => typeof key === "string")
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ];

  for (const key of candidateKeys) {
    if (markup[key]) {
      return markup[key];
    }
  }

  return null;
}

/**
 * @param {unknown} topicMarkup
 * @returns {TopicMarkupRange[]}
 */
export function getTopicMarkupRanges(topicMarkup) {
  if (!topicMarkup || !Array.isArray(topicMarkup.ranges)) {
    return [];
  }

  return topicMarkup.ranges
    .filter((range) => {
      if (!range || typeof range !== "object") {
        return false;
      }
      return (
        Number.isInteger(range.sentence_start) &&
        Number.isInteger(range.sentence_end) &&
        typeof range.html === "string" &&
        range.html.trim().length > 0
      );
    })
    .slice()
    .sort((left, right) => {
      if (left.sentence_start !== right.sentence_start) {
        return left.sentence_start - right.sentence_start;
      }
      return left.sentence_end - right.sentence_end;
    });
}
