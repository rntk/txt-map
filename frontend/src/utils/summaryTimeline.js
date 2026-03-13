const TOPIC_SEPARATOR = '>';

export function splitTopicPath(topicName) {
  return String(topicName || '')
    .split(TOPIC_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function hashString(value) {
  let hash = 0;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeSentenceNumbers(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export function getTopicColorTokens(topicLabel) {
  const hue = hashString(topicLabel) % 360;

  return {
    accent: `hsl(${hue} 42% 46%)`,
    dot: `hsl(${hue} 48% 50%)`,
    surface: `hsla(${hue} 48% 52% / 0.12)`,
    border: `hsla(${hue} 40% 40% / 0.26)`,
    sectionSurface: `hsla(${hue} 48% 52% / 0.12)`,
    sectionBorder: `hsla(${hue} 40% 40% / 0.18)`,
    sectionText: `hsl(${hue} 36% 42%)`,
    subtopicText: `hsla(${hue} 28% 24% / 0.44)`
  };
}

export function chooseSummaryTopic(mapping, topics) {
  const sourceSentences = normalizeSentenceNumbers(mapping?.source_sentences);
  if (sourceSentences.length === 0) {
    return null;
  }

  const sourceSet = new Set(sourceSentences);
  let bestMatch = null;

  (Array.isArray(topics) ? topics : []).forEach((topic, topicIndex) => {
    const pathSegments = splitTopicPath(topic?.name);
    if (pathSegments.length === 0) {
      return;
    }

    const topicSentences = normalizeSentenceNumbers(topic?.sentences);
    if (topicSentences.length === 0) {
      return;
    }

    let overlapCount = 0;
    topicSentences.forEach((sentenceNumber) => {
      if (sourceSet.has(sentenceNumber)) {
        overlapCount += 1;
      }
    });

    if (overlapCount === 0) {
      return;
    }

    const candidate = {
      topic,
      topicIndex,
      overlapCount,
      pathSegments,
      depth: pathSegments.length
    };

    if (!bestMatch) {
      bestMatch = candidate;
      return;
    }

    if (candidate.depth > bestMatch.depth) {
      bestMatch = candidate;
      return;
    }

    if (candidate.depth === bestMatch.depth && candidate.overlapCount > bestMatch.overlapCount) {
      bestMatch = candidate;
      return;
    }

    if (
      candidate.depth === bestMatch.depth &&
      candidate.overlapCount === bestMatch.overlapCount &&
      candidate.topicIndex < bestMatch.topicIndex
    ) {
      bestMatch = candidate;
    }
  });

  return bestMatch;
}

export function buildSummaryTimelineItems(summaryEntries, summaryMappings, topics) {
  const mappingByIndex = new Map();
  (Array.isArray(summaryMappings) ? summaryMappings : []).forEach((mapping) => {
    const summaryIndex = Number(mapping?.summary_index);
    if (Number.isInteger(summaryIndex) && !mappingByIndex.has(summaryIndex)) {
      mappingByIndex.set(summaryIndex, mapping);
    }
  });

  let previousTopLevelLabel = null;

  return (Array.isArray(summaryEntries) ? summaryEntries : []).map((summaryText, index) => {
    const mapping = mappingByIndex.get(index) || null;
    const chosenTopic = chooseSummaryTopic(mapping, topics);
    const topLevelLabel = chosenTopic ? chosenTopic.pathSegments[0] : '';
    const subtopicLabel = chosenTopic
      ? chosenTopic.pathSegments[chosenTopic.pathSegments.length - 1]
      : '';
    const showSectionLabel = Boolean(topLevelLabel && topLevelLabel !== previousTopLevelLabel);

    if (topLevelLabel) {
      previousTopLevelLabel = topLevelLabel;
    }

    return {
      index,
      summaryText,
      mapping,
      topLevelLabel,
      subtopicLabel,
      showSectionLabel,
      topicColor: topLevelLabel ? getTopicColorTokens(topLevelLabel) : null
    };
  });
}
