import { useCallback } from "react";
import { normalizeCharRange } from "../utils/textHighlight";

function getViewportBounds() {
  const viewportTop = window.scrollY || document.documentElement.scrollTop || 0;
  const viewportBottom =
    viewportTop +
    (window.innerHeight || document.documentElement.clientHeight || 0);
  return { viewportTop, viewportBottom, margin: 8 };
}

function scrollElementIntoView(element) {
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function getGroupedTopicSections() {
  return Array.from(document.querySelectorAll('[id^="grouped-topic-"]'));
}

function getNextSectionIndex(currentIndex, sectionCount, direction) {
  if (direction === "next") {
    return currentIndex < sectionCount - 1 ? currentIndex + 1 : currentIndex;
  }
  return currentIndex > 0 ? currentIndex - 1 : 0;
}

function isBoundaryBeyondThreshold(direction, boundary, threshold) {
  return (
    (direction === "next" && boundary > threshold) ||
    (direction !== "next" && boundary < threshold)
  );
}

function highlightGroupedSection(
  name,
  selectedTopics,
  setHighlightedGroupedTopic,
) {
  setHighlightedGroupedTopic(name);
  if (!selectedTopics.some((candidate) => candidate.name === name)) {
    setTimeout(() => setHighlightedGroupedTopic(null), 1500);
  }
}

function findVisibleTargetIndex(targets, resolveElement, direction, viewport) {
  const { viewportTop, viewportBottom, margin } = viewport;
  const indexes =
    direction === "next"
      ? targets.map((_, index) => index)
      : targets.map((_, index) => index).reverse();

  for (const index of indexes) {
    const element = resolveElement(targets[index]);
    if (!element) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    const boundary =
      direction === "next"
        ? rect.top + window.scrollY
        : rect.bottom + window.scrollY;
    const threshold =
      direction === "next" ? viewportBottom - margin : viewportTop + margin;
    if (isBoundaryBeyondThreshold(direction, boundary, threshold)) {
      return index;
    }
  }

  return -1;
}

function getMarkupTopicElement(topicName) {
  return (
    Array.from(document.querySelectorAll("[data-topic-name]")).find(
      (el) => el.dataset.topicName === topicName,
    ) || null
  );
}

function getArticleTopicElement(topicName) {
  return (
    Array.from(document.querySelectorAll("[data-topic-names]")).find((el) =>
      (el.dataset.topicNames || "").split("\n").includes(topicName),
    ) || null
  );
}

function getSentenceElement(articleIndex, sentenceIndex) {
  const byId = document.getElementById(
    `sentence-${articleIndex}-${sentenceIndex}`,
  );
  if (byId) {
    return byId;
  }
  return document.querySelector(
    `[data-article-index="${articleIndex}"][data-sentence-index="${sentenceIndex}"]`,
  );
}

function getCharElement(articleIndex, charStart) {
  const exact = document.querySelector(
    `[data-article-index="${articleIndex}"][data-char-start="${charStart}"]`,
  );
  if (exact) {
    return exact;
  }

  const candidates = Array.from(
    document.querySelectorAll(
      `[data-article-index="${articleIndex}"][data-char-start]`,
    ),
  );
  if (candidates.length === 0) {
    return null;
  }

  const withOffsets = candidates
    .map((el) => ({
      el,
      start: Number(el.getAttribute("data-char-start")),
    }))
    .filter((entry) => Number.isFinite(entry.start))
    .sort((a, b) => a.start - b.start);

  const firstAfter = withOffsets.find((entry) => entry.start >= charStart);
  return firstAfter ? firstAfter.el : withOffsets[withOffsets.length - 1].el;
}

function buildTopicAnchors(topic, safeTopics, activeTab, rawText) {
  if (!topic?.name) {
    return [];
  }

  const related = safeTopics.find((candidate) => candidate.name === topic.name);
  if (!related) {
    return [];
  }

  const ranges = Array.isArray(related.ranges) ? related.ranges : [];
  const anchors = ranges
    .map((range) => {
      const normalizedRange =
        activeTab === "raw_text"
          ? normalizeCharRange(range, rawText.length)
          : {
              start: Number(range?.start),
              end: Number(range?.end),
            };
      if (!normalizedRange) {
        return null;
      }
      return {
        charStart: normalizedRange.start,
        charEnd: normalizedRange.end,
        sentenceStart: Number(range?.sentence_start) - 1,
      };
    })
    .filter(
      (target) =>
        target &&
        Number.isFinite(target.charStart) &&
        Number.isFinite(target.charEnd),
    )
    .sort((a, b) => a.charStart - b.charStart);

  if (anchors.length > 0) {
    return anchors;
  }

  const sentenceTargets = Array.isArray(related.sentences)
    ? related.sentences
    : [];
  return sentenceTargets
    .map((num) => Number(num) - 1)
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a - b)
    .map((sentenceStart) => ({ sentenceStart }));
}

function handleGroupedNavigation({
  topic,
  direction,
  selectedTopics,
  setHighlightedGroupedTopic,
}) {
  if (direction === "focus") {
    const element = document.getElementById(`grouped-topic-${topic.name}`);
    if (element) {
      scrollElementIntoView(element);
      highlightGroupedSection(
        topic.name,
        selectedTopics,
        setHighlightedGroupedTopic,
      );
    }
    return;
  }

  const allSections = getGroupedTopicSections();
  const currentId = `grouped-topic-${topic.name}`;
  const currentIdx = allSections.findIndex((el) => el.id === currentId);
  const targetIdx = getNextSectionIndex(
    currentIdx,
    allSections.length,
    direction,
  );
  const targetEl = allSections[targetIdx];
  if (targetEl) {
    scrollElementIntoView(targetEl);
    highlightGroupedSection(
      targetEl.id.replace("grouped-topic-", ""),
      selectedTopics,
      setHighlightedGroupedTopic,
    );
  }
}

function getSummaryParagraphBoundary(element, direction) {
  const rect = element.getBoundingClientRect();
  return direction === "next"
    ? rect.top + window.scrollY
    : rect.bottom + window.scrollY;
}

function getSummaryThreshold(direction, viewportBottom, viewportTop, margin) {
  return direction === "next" ? viewportBottom - margin : viewportTop + margin;
}

function findSummaryParagraphElement(paraIndices, direction) {
  if (direction === "focus") {
    return document.getElementById(`summary-para-${paraIndices[0]}`);
  }

  const { viewportTop, viewportBottom, margin } = getViewportBounds();
  const candidateIndices =
    direction === "next" ? paraIndices : [...paraIndices].reverse();
  for (const index of candidateIndices) {
    const element = document.getElementById(`summary-para-${index}`);
    if (!element) {
      continue;
    }
    const boundary = getSummaryParagraphBoundary(element, direction);
    const threshold = getSummaryThreshold(
      direction,
      viewportBottom,
      viewportTop,
      margin,
    );
    if (isBoundaryBeyondThreshold(direction, boundary, threshold)) {
      return element;
    }
  }
  return null;
}

function handleSummaryTimelineNavigation(
  topic,
  direction,
  topicSummaryParaMap,
) {
  const paraIndices = topicSummaryParaMap[topic.name];
  if (!paraIndices || paraIndices.length === 0) {
    return;
  }
  scrollElementIntoView(findSummaryParagraphElement(paraIndices, direction));
}

function resolveTopicElement(activeTab, topicName, target) {
  if (activeTab === "markup" && topicName) {
    const markupElement = getMarkupTopicElement(topicName);
    if (markupElement) {
      return markupElement;
    }
  }
  if (activeTab === "article" && topicName) {
    const articleElement = getArticleTopicElement(topicName);
    if (articleElement) {
      return articleElement;
    }
  }
  if (Number.isFinite(target.charStart)) {
    return getCharElement(0, target.charStart);
  }
  return getSentenceElement(0, target.sentenceStart);
}

function handleStandardNavigation(topic, direction, activeTab, targets) {
  if (direction === "focus") {
    scrollElementIntoView(
      resolveTopicElement(activeTab, topic?.name, targets[0]),
    );
    return;
  }

  const targetIndex = findVisibleTargetIndex(
    targets,
    (target) => resolveTopicElement(activeTab, topic?.name, target),
    direction,
    getViewportBounds(),
  );
  if (targetIndex !== -1) {
    scrollElementIntoView(
      resolveTopicElement(activeTab, topic?.name, targets[targetIndex]),
    );
  }
}

export function useTopicNavigation({
  activeTab,
  rawText,
  safeTopics,
  groupedByTopics,
  selectedTopics,
  topicSummaryParaMap,
  setHighlightedGroupedTopic,
}) {
  const getTopicAnchors = useCallback(
    (topic) => buildTopicAnchors(topic, safeTopics, activeTab, rawText),
    [activeTab, rawText, safeTopics],
  );

  const navigateTopicSentence = useCallback(
    (topic, direction = "next") => {
      if (groupedByTopics) {
        handleGroupedNavigation({
          topic,
          direction,
          selectedTopics,
          setHighlightedGroupedTopic,
        });
        return;
      }

      if (activeTab === "topic_summary_timeline") {
        handleSummaryTimelineNavigation(topic, direction, topicSummaryParaMap);
        return;
      }

      const targets = getTopicAnchors(topic);
      if (targets.length === 0) return;
      handleStandardNavigation(topic, direction, activeTab, targets);
    },
    [
      activeTab,
      getTopicAnchors,
      groupedByTopics,
      selectedTopics,
      setHighlightedGroupedTopic,
      topicSummaryParaMap,
    ],
  );

  return { navigateTopicSentence };
}
