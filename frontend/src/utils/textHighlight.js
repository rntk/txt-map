export function normalizeCharRange(range, textLength) {
  const start = Number(range?.start);
  const end = Number(range?.end);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  const clampedStart = Math.max(0, Math.min(textLength, start));
  const clampedEnd = Math.max(0, Math.min(textLength, end));

  if (clampedEnd <= clampedStart) {
    return null;
  }

  return { start: clampedStart, end: clampedEnd };
}

export function buildTopicStateRanges(
  topics,
  selectedTopics,
  hoveredTopic,
  readTopics,
  textLength,
) {
  const highlightRanges = [];
  const fadeRanges = [];
  const selectedNames = new Set(
    (Array.isArray(selectedTopics) ? selectedTopics : []).map(
      (topic) => topic?.name,
    ),
  );
  const hoveredName = hoveredTopic?.name || null;
  const readNames =
    readTopics instanceof Set ? readTopics : new Set(readTopics || []);

  (Array.isArray(topics) ? topics : []).forEach((topic) => {
    const topicName = topic?.name;
    const ranges = Array.isArray(topic?.ranges) ? topic.ranges : [];
    if (!topicName || ranges.length === 0) {
      return;
    }

    const isHighlighted =
      selectedNames.has(topicName) || hoveredName === topicName;
    const isFaded = readNames.has(topicName);

    ranges.forEach((range) => {
      const normalizedRange = normalizeCharRange(range, textLength);
      if (!normalizedRange) {
        return;
      }

      if (isHighlighted) {
        highlightRanges.push(normalizedRange);
      } else if (isFaded) {
        fadeRanges.push(normalizedRange);
      }
    });
  });

  return { highlightRanges, fadeRanges };
}

export function buildRawTextSegments(
  rawText,
  highlightRanges,
  fadeRanges,
  coloredRanges = [],
) {
  if (!rawText) {
    return [];
  }

  const useColoredMode = coloredRanges.length > 0;
  const activeRanges = useColoredMode
    ? coloredRanges
    : [...highlightRanges, ...fadeRanges];

  const boundaries = new Set([0, rawText.length]);
  activeRanges.forEach((range) => {
    boundaries.add(range.start);
    boundaries.add(range.end);
  });

  const sortedBoundaries = Array.from(boundaries)
    .filter(
      (value) =>
        Number.isFinite(value) && value >= 0 && value <= rawText.length,
    )
    .sort((a, b) => a - b);

  const overlapsRange = (start, end, ranges) =>
    ranges.some((range) => start < range.end && end > range.start);
  const findColoredRange = (start, end) =>
    coloredRanges.find((r) => start < r.end && end > r.start) || null;
  const segments = [];

  for (let i = 0; i < sortedBoundaries.length - 1; i += 1) {
    const start = sortedBoundaries[i];
    const end = sortedBoundaries[i + 1];

    if (end <= start) {
      continue;
    }

    let state = null;
    let color = null;

    if (useColoredMode) {
      const match = findColoredRange(start, end);
      if (match) {
        state = "colored";
        color = match.color;
      }
    } else {
      if (overlapsRange(start, end, highlightRanges)) {
        state = "highlighted";
      } else if (overlapsRange(start, end, fadeRanges)) {
        state = "faded";
      }
    }

    const text = rawText.slice(start, end);
    if (!text) {
      continue;
    }

    const previous = segments[segments.length - 1];
    if (
      previous &&
      previous.state === state &&
      previous.color === color &&
      previous.end === start
    ) {
      previous.text += text;
      previous.end = end;
      continue;
    }

    segments.push({ start, end, text, state, color });
  }

  return segments;
}
