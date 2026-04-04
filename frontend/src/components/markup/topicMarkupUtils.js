import { getSegmentIndices } from "./markupUtils";

const INDEX_ARRAY_KEYS = new Set([
  "position_indices",
  "sentence_indices",
  "answer_position_indices",
  "answer_sentence_indices",
  "explanation_position_indices",
  "explanation_sentence_indices",
]);

const WORD_INDEX_ARRAY_KEYS = new Set([
  "word_indices",
  "answer_word_indices",
  "question_word_indices",
  "title_word_indices",
  "term_word_indices",
]);

const INDEX_VALUE_KEYS = new Set([
  "position_index",
  "sentence_index",
  "title_position_index",
  "title_sentence_index",
  "question_position_index",
  "question_sentence_index",
]);

const ATOMIC_SEGMENT_TYPES = new Set(["data_trend"]);

/**
 * @typedef {Object} TopicMarkupPosition
 * @property {number} [index]
 * @property {string} [text]
 * @property {number} [source_sentence_index]
 * @property {number} [word_start_index]
 * @property {number} [word_end_index]
 *
 * @typedef {Object} EnrichedRangeGroup
 * @property {number} groupNumber
 * @property {number} firstSourceSentenceIndex
 * @property {number} lastSourceSentenceIndex
 * @property {TopicMarkupPosition[]} positions
 * @property {number[]} [sentenceIndices]
 *
 * @typedef {Object} RemappedTopicMarkup
 * @property {TopicMarkupPosition[]} positions
 * @property {Array<Record<string, unknown>>} segments
 */

function groupConsecutive(sortedIndices) {
  if (sortedIndices.length === 0) return [];
  const groups = [];
  let currentGroup = [sortedIndices[0]];

  for (let i = 1; i < sortedIndices.length; i += 1) {
    if (sortedIndices[i] - sortedIndices[i - 1] <= 1) {
      currentGroup.push(sortedIndices[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sortedIndices[i]];
    }
  }

  groups.push(currentGroup);
  return groups;
}

function distributePositionsAcrossGroups(sortedPositions, groups) {
  if (
    !Array.isArray(sortedPositions) ||
    sortedPositions.length === 0 ||
    !Array.isArray(groups) ||
    groups.length === 0
  ) {
    return [];
  }

  const totalWeight = groups.reduce((sum, group) => {
    const explicitCount = Array.isArray(group.sentenceIndices)
      ? group.sentenceIndices.length
      : 0;
    const rangeCount =
      Number.isInteger(group.firstSourceSentenceIndex) &&
      Number.isInteger(group.lastSourceSentenceIndex)
        ? Math.max(
            1,
            group.lastSourceSentenceIndex - group.firstSourceSentenceIndex + 1,
          )
        : 1;
    return sum + Math.max(explicitCount, rangeCount, 1);
  }, 0);

  const remainingGroupCount = groups.length;
  let remainingPositions = sortedPositions.length;
  let offset = 0;

  return groups
    .map((group, groupIndex) => {
      const explicitCount = Array.isArray(group.sentenceIndices)
        ? group.sentenceIndices.length
        : 0;
      const rangeCount =
        Number.isInteger(group.firstSourceSentenceIndex) &&
        Number.isInteger(group.lastSourceSentenceIndex)
          ? Math.max(
              1,
              group.lastSourceSentenceIndex -
                group.firstSourceSentenceIndex +
                1,
            )
          : 1;
      const weight = Math.max(explicitCount, rangeCount, 1);
      const groupsLeft = remainingGroupCount - groupIndex;

      let allocation;
      if (groupIndex === groups.length - 1) {
        allocation = remainingPositions;
      } else {
        const proportional =
          totalWeight > 0
            ? Math.round((weight / totalWeight) * sortedPositions.length)
            : 1;
        const maxAllocation = remainingPositions - (groupsLeft - 1);
        allocation = Math.max(1, Math.min(maxAllocation, proportional));
      }

      const nextOffset = offset + allocation;
      const positions = sortedPositions.slice(offset, nextOffset);
      offset = nextOffset;
      remainingPositions -= positions.length;

      return {
        ...group,
        positions,
      };
    })
    .filter((group) => group.positions.length > 0);
}

function getPositionSourceSentenceIndex(position, fallbackIndex) {
  if (Number.isInteger(position?.source_sentence_index)) {
    return position.source_sentence_index;
  }
  if (Number.isInteger(position?.index)) {
    return position.index;
  }
  return fallbackIndex;
}

function buildSentenceGroupsFromIndices(sentenceIndices) {
  if (!Array.isArray(sentenceIndices) || sentenceIndices.length === 0) {
    return [];
  }

  const sortedIndices = sentenceIndices
    .filter((index) => Number.isInteger(index))
    .slice()
    .sort((left, right) => left - right);

  return groupConsecutive(sortedIndices).map((group) => ({
    firstSourceSentenceIndex: group[0],
    lastSourceSentenceIndex: group[group.length - 1],
    sentenceIndices: group,
  }));
}

function buildSentenceGroupsFromRanges(ranges) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return [];
  }

  return ranges
    .map((range) => {
      const firstSourceSentenceIndex = Number.isInteger(range?.sentence_start)
        ? range.sentence_start
        : null;
      const lastSourceSentenceIndex = Number.isInteger(range?.sentence_end)
        ? range.sentence_end
        : firstSourceSentenceIndex;

      if (
        !Number.isInteger(firstSourceSentenceIndex) ||
        !Number.isInteger(lastSourceSentenceIndex)
      ) {
        return null;
      }

      return {
        firstSourceSentenceIndex,
        lastSourceSentenceIndex,
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.firstSourceSentenceIndex - right.firstSourceSentenceIndex,
    );
}

function buildEnrichedRangeGroups(positions) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return [];
  }

  const sortedPositions = positions
    .filter((position) => Number.isInteger(position?.index))
    .slice()
    .sort((left, right) => left.index - right.index);

  if (sortedPositions.length === 0) {
    return [];
  }

  const groups = [];
  let currentGroupPositions = [];
  let currentFirstSourceSentenceIndex = null;
  let currentLastSourceSentenceIndex = null;

  sortedPositions.forEach((position, index) => {
    const sourceSentenceIndex = getPositionSourceSentenceIndex(
      position,
      index + 1,
    );
    const isAdjacent =
      currentLastSourceSentenceIndex != null &&
      sourceSentenceIndex <= currentLastSourceSentenceIndex + 1;

    if (currentGroupPositions.length > 0 && !isAdjacent) {
      groups.push({
        groupNumber: groups.length + 1,
        firstSourceSentenceIndex: currentFirstSourceSentenceIndex,
        lastSourceSentenceIndex: currentLastSourceSentenceIndex,
        positions: currentGroupPositions,
      });
      currentGroupPositions = [];
      currentFirstSourceSentenceIndex = null;
      currentLastSourceSentenceIndex = null;
    }

    currentGroupPositions.push(position);
    if (currentFirstSourceSentenceIndex == null) {
      currentFirstSourceSentenceIndex = sourceSentenceIndex;
    }
    currentLastSourceSentenceIndex = sourceSentenceIndex;
  });

  if (currentGroupPositions.length > 0) {
    groups.push({
      groupNumber: groups.length + 1,
      firstSourceSentenceIndex: currentFirstSourceSentenceIndex,
      lastSourceSentenceIndex: currentLastSourceSentenceIndex,
      positions: currentGroupPositions,
    });
  }

  return groups;
}

export function buildEnrichedRangeGroupsWithFallbacks(
  positions,
  sentenceIndices,
  ranges,
) {
  const groupsFromPositions = buildEnrichedRangeGroups(positions);
  if (groupsFromPositions.length > 1) {
    return groupsFromPositions;
  }

  const sortedPositions = Array.isArray(positions)
    ? positions
        .filter((position) => Number.isInteger(position?.index))
        .slice()
        .sort((left, right) => left.index - right.index)
    : [];

  if (sortedPositions.length === 0) {
    return [];
  }

  const groupsFromSentenceIndices =
    buildSentenceGroupsFromIndices(sentenceIndices);
  if (groupsFromSentenceIndices.length > 1) {
    return distributePositionsAcrossGroups(
      sortedPositions,
      groupsFromSentenceIndices.map((group, index) => ({
        groupNumber: index + 1,
        firstSourceSentenceIndex: group.firstSourceSentenceIndex,
        lastSourceSentenceIndex: group.lastSourceSentenceIndex,
        sentenceIndices: group.sentenceIndices,
      })),
    );
  }

  const groupsFromRanges = buildSentenceGroupsFromRanges(ranges);
  if (groupsFromRanges.length > 1) {
    return distributePositionsAcrossGroups(
      sortedPositions,
      groupsFromRanges.map((group, index) => ({
        groupNumber: index + 1,
        firstSourceSentenceIndex: group.firstSourceSentenceIndex,
        lastSourceSentenceIndex: group.lastSourceSentenceIndex,
      })),
    );
  }

  return groupsFromPositions;
}

function remapNestedMarkupValue(value, positionIndexMap, wordIndexMap) {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        remapNestedMarkupValue(item, positionIndexMap, wordIndexMap),
      )
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const nextValue = {};
    Object.entries(value).forEach(([key, nestedValue]) => {
      if (INDEX_ARRAY_KEYS.has(key)) {
        const remappedIndices = Array.isArray(nestedValue)
          ? [
              ...new Set(
                nestedValue
                  .map((index) => positionIndexMap.get(index))
                  .filter((index) => Number.isInteger(index)),
              ),
            ].sort((a, b) => a - b)
          : [];
        if (remappedIndices.length > 0) {
          nextValue[key] = remappedIndices;
        }
        return;
      }

      if (WORD_INDEX_ARRAY_KEYS.has(key)) {
        const remappedWordIndices = Array.isArray(nestedValue)
          ? [
              ...new Set(
                nestedValue
                  .map((index) => wordIndexMap.get(index))
                  .filter((index) => Number.isInteger(index)),
              ),
            ].sort((a, b) => a - b)
          : [];
        if (remappedWordIndices.length > 0) {
          nextValue[key] = remappedWordIndices;
        }
        return;
      }

      if (INDEX_VALUE_KEYS.has(key)) {
        const remappedIndex = positionIndexMap.get(nestedValue);
        if (Number.isInteger(remappedIndex)) {
          nextValue[key] = remappedIndex;
        }
        return;
      }

      const remappedNestedValue = remapNestedMarkupValue(
        nestedValue,
        positionIndexMap,
        wordIndexMap,
      );
      if (remappedNestedValue !== undefined) {
        nextValue[key] = remappedNestedValue;
      }
    });
    return nextValue;
  }

  return value;
}

export function buildGroupMarkup(topicMarkup, rangeGroup) {
  const segments = Array.isArray(topicMarkup?.segments)
    ? topicMarkup.segments
    : [];
  const groupPositions = Array.isArray(rangeGroup?.positions)
    ? rangeGroup.positions
    : [];
  const groupPositionIndexSet = new Set(
    groupPositions.map((position) => position.index),
  );
  const groupPositionIndexMap = new Map(
    groupPositions.map((position, index) => [position.index, index + 1]),
  );
  const groupWordIndexMap = new Map();
  let nextGroupWordIndex = 1;

  groupPositions.forEach((position) => {
    const wordStartIndex = Number.isInteger(position?.word_start_index)
      ? position.word_start_index
      : null;
    const wordEndIndex = Number.isInteger(position?.word_end_index)
      ? position.word_end_index
      : null;
    if (
      wordStartIndex == null ||
      wordEndIndex == null ||
      wordEndIndex < wordStartIndex
    ) {
      return;
    }
    for (let index = wordStartIndex; index <= wordEndIndex; index += 1) {
      groupWordIndexMap.set(index, nextGroupWordIndex);
      nextGroupWordIndex += 1;
    }
  });

  const remappedSegments = segments.reduce((nextSegments, segment) => {
    const segmentIndices = getSegmentIndices(segment);
    const overlappingIndices = segmentIndices.filter((index) =>
      groupPositionIndexSet.has(index),
    );

    if (overlappingIndices.length === 0) {
      return nextSegments;
    }

    const isAtomicCrossRangeSegment =
      ATOMIC_SEGMENT_TYPES.has(segment?.type) &&
      overlappingIndices.length !== segmentIndices.length;
    if (
      isAtomicCrossRangeSegment &&
      segmentIndices[0] !== overlappingIndices[0]
    ) {
      return nextSegments;
    }

    const remappedSegment = remapNestedMarkupValue(
      segment,
      groupPositionIndexMap,
      groupWordIndexMap,
    );
    remappedSegment.position_indices = overlappingIndices
      .map((index) => groupPositionIndexMap.get(index))
      .filter((index) => Number.isInteger(index))
      .sort((a, b) => a - b);

    if (remappedSegment.position_indices.length === 0) {
      return nextSegments;
    }

    nextSegments.push(remappedSegment);
    return nextSegments;
  }, []);

  return {
    positions: groupPositions.map((position, index) => {
      const wordStartIndex = Number.isInteger(position?.word_start_index)
        ? groupWordIndexMap.get(position.word_start_index)
        : undefined;
      const wordEndIndex = Number.isInteger(position?.word_end_index)
        ? groupWordIndexMap.get(position.word_end_index)
        : undefined;

      return {
        ...position,
        index: index + 1,
        ...(Number.isInteger(wordStartIndex)
          ? { word_start_index: wordStartIndex }
          : {}),
        ...(Number.isInteger(wordEndIndex)
          ? { word_end_index: wordEndIndex }
          : {}),
      };
    }),
    segments: remappedSegments,
  };
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
