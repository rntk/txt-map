/**
 * @typedef {Object} TopicModalSelection
 * @property {"topic" | "topic_group" | "summary_source" | "keyword"} [kind]
 * @property {string} [name]
 * @property {string} [fullPath]
 * @property {string} [displayName]
 * @property {number[]} [sentenceIndices]
 * @property {Array<unknown>} [ranges]
 * @property {string[]} [canonicalTopicNames]
 * @property {string | null} [primaryTopicName]
 * @property {string[]} [_sentences]
 * @property {string} [_summarySentence]
 */

function normalizeName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toSentenceIndexArray(values) {
  const source = Array.isArray(values)
    ? values
    : values instanceof Set
      ? Array.from(values)
      : [];

  return source
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function uniqueSortedNumbers(values) {
  return [...new Set(toSentenceIndexArray(values))].sort((left, right) => {
    return left - right;
  });
}

/**
 * @param {unknown[]} allTopics
 * @returns {Array<{ name: string, sentences?: number[], ranges?: Array<unknown> }>}
 */
function getSafeTopics(allTopics) {
  return Array.isArray(allTopics) ? allTopics : [];
}

/**
 * @param {TopicModalSelection | null | undefined} selection
 * @returns {string[]}
 */
export function getTopicSelectionCanonicalTopicNames(selection) {
  if (Array.isArray(selection?.canonicalTopicNames)) {
    return [
      ...new Set(
        selection.canonicalTopicNames
          .map((name) => normalizeName(name))
          .filter(Boolean),
      ),
    ];
  }

  const primaryName =
    normalizeName(selection?.primaryTopicName) ||
    normalizeName(selection?.fullPath) ||
    normalizeName(selection?.name);

  return primaryName ? [primaryName] : [];
}

/**
 * @param {TopicModalSelection | null | undefined} selection
 * @param {unknown[]} allTopics
 * @returns {Array<{ name: string, sentences?: number[], ranges?: Array<unknown> }>}
 */
export function resolveCanonicalTopics(selection, allTopics) {
  const safeTopics = getSafeTopics(allTopics);
  const names = getTopicSelectionCanonicalTopicNames(selection);

  return names
    .map((name) =>
      safeTopics.find((topic) => normalizeName(topic?.name) === name),
    )
    .filter(Boolean);
}

/**
 * @param {TopicModalSelection | null | undefined} selection
 * @param {unknown[]} allTopics
 * @returns {TopicModalSelection | null}
 */
export function buildTopicModalSelection(selection, allTopics = []) {
  if (!selection) {
    return null;
  }

  const safeTopics = getSafeTopics(allTopics);
  const canonicalTopics = resolveCanonicalTopics(selection, safeTopics);
  const canonicalTopicNames =
    canonicalTopics.length > 0
      ? canonicalTopics.map((topic) => topic.name)
      : getTopicSelectionCanonicalTopicNames(selection);

  const canonicalSentenceIndices =
    canonicalTopics.length > 0
      ? canonicalTopics.flatMap((topic) => topic.sentences || [])
      : [];
  const canonicalRanges =
    canonicalTopics.length > 0
      ? canonicalTopics.flatMap((topic) =>
          Array.isArray(topic?.ranges) ? topic.ranges : [],
        )
      : [];

  const sentenceIndices = uniqueSortedNumbers(
    selection.sentenceIndices?.length
      ? selection.sentenceIndices
      : canonicalSentenceIndices,
  );
  const ranges =
    Array.isArray(selection.ranges) && selection.ranges.length > 0
      ? selection.ranges
      : canonicalRanges;

  const fallbackPrimary =
    canonicalTopicNames.length > 0 ? canonicalTopicNames[0] : null;
  const primaryTopicName =
    normalizeName(selection.primaryTopicName) || fallbackPrimary;
  const displayName =
    normalizeName(selection.displayName) ||
    normalizeName(selection.name) ||
    normalizeName(primaryTopicName) ||
    "Source Sentences";
  const fullPath =
    normalizeName(selection.fullPath) ||
    normalizeName(primaryTopicName) ||
    normalizeName(selection.name) ||
    displayName;
  const name =
    normalizeName(selection.name) ||
    normalizeName(primaryTopicName) ||
    fullPath ||
    displayName;

  return {
    ...selection,
    kind:
      selection.kind ||
      (canonicalTopicNames.length > 1
        ? "topic_group"
        : canonicalTopicNames.length === 1
          ? "topic"
          : "keyword"),
    name,
    fullPath,
    displayName,
    sentenceIndices,
    ranges,
    canonicalTopicNames,
    primaryTopicName,
  };
}

/**
 * @param {{ name?: string, fullPath?: string, displayName?: string, sentenceIndices?: number[] | Set<number>, ranges?: Array<unknown>, canonicalTopicNames?: string[], primaryTopicName?: string | null, _sentences?: string[], _summarySentence?: string }} topic
 * @returns {TopicModalSelection}
 */
export function buildModalSelectionFromTopic(topic) {
  return {
    kind: "topic",
    ...topic,
    sentenceIndices: uniqueSortedNumbers(
      topic?.sentenceIndices || topic?.sentences,
    ),
    canonicalTopicNames: Array.isArray(topic?.canonicalTopicNames)
      ? topic.canonicalTopicNames
      : undefined,
    primaryTopicName: topic?.primaryTopicName || topic?.fullPath || topic?.name,
  };
}

/**
 * @param {Array<{ name?: string, sentences?: number[], ranges?: Array<unknown> }>} topics
 * @param {string[]} sentences
 * @returns {TopicModalSelection | null}
 */
export function buildModalSelectionFromTopicGroup(topics, sentences = []) {
  const safeTopics = Array.isArray(topics) ? topics.filter(Boolean) : [];
  if (safeTopics.length === 0) {
    return null;
  }

  const canonicalTopicNames = safeTopics
    .map((topic) => normalizeName(topic?.name))
    .filter(Boolean);
  const sentenceIndices = uniqueSortedNumbers(
    safeTopics.flatMap((topic) => topic?.sentences || []),
  );
  const ranges = safeTopics.flatMap((topic) =>
    Array.isArray(topic?.ranges) ? topic.ranges : [],
  );
  const firstTopicName = canonicalTopicNames[0] || "Topic Group";
  const groupLabel = `${firstTopicName.split(/[\s_>]/)[0]} Group (${canonicalTopicNames.length} topics)`;

  return {
    kind: "topic_group",
    name: groupLabel,
    displayName: groupLabel,
    fullPath: groupLabel,
    sentenceIndices,
    ranges,
    canonicalTopicNames,
    primaryTopicName: canonicalTopicNames[0] || null,
    _sentences: Array.isArray(sentences) ? sentences : [],
  };
}

/**
 * @param {{ topicName?: string | null, sentenceIndices?: number[], sentences?: string[], summarySentence?: string }} options
 * @returns {TopicModalSelection}
 */
export function buildModalSelectionFromSummarySource({
  topicName,
  sentenceIndices,
  sentences,
  summarySentence,
}) {
  const canonicalTopicName = normalizeName(topicName);
  const displayName = canonicalTopicName || "Source Sentences";

  return {
    kind: "summary_source",
    name: displayName,
    displayName,
    fullPath: canonicalTopicName || displayName,
    sentenceIndices: uniqueSortedNumbers(sentenceIndices),
    canonicalTopicNames: canonicalTopicName ? [canonicalTopicName] : [],
    primaryTopicName: canonicalTopicName || null,
    _summarySentence: summarySentence,
    _sentences: Array.isArray(sentences) ? sentences : [],
  };
}

/**
 * @param {string} keyword
 * @param {number[]} sentenceIndices
 * @param {string[]} sentences
 * @returns {TopicModalSelection}
 */
export function buildModalSelectionFromKeyword(
  keyword,
  sentenceIndices,
  sentences = [],
) {
  const displayName = normalizeName(keyword) || "Keyword";

  return {
    kind: "keyword",
    name: displayName,
    displayName,
    fullPath: displayName,
    sentenceIndices: uniqueSortedNumbers(sentenceIndices),
    canonicalTopicNames: [],
    primaryTopicName: null,
    _sentences: Array.isArray(sentences) ? sentences : [],
  };
}
