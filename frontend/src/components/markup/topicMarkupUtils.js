/**
 * @typedef {Object} TopicMarkupRange
 * @property {number} [range_index]
 * @property {number} [sentence_start]
 * @property {number} [sentence_end]
 * @property {string} [html]
 */

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
