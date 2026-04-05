import { getTopicSelectionCanonicalTopicNames } from "./topicModalSelection";

/**
 * @param {Set<string> | string[] | Iterable<string> | null | undefined} readTopics
 * @returns {Set<string>}
 */
export function toReadTopicsSet(readTopics) {
  if (readTopics instanceof Set) {
    return readTopics;
  }

  if (!readTopics) {
    return new Set();
  }

  return new Set(readTopics);
}

/**
 * @param {string | null | undefined} topicName
 * @param {Set<string> | string[] | Iterable<string> | null | undefined} readTopics
 * @returns {boolean}
 */
export function isExactTopicRead(topicName, readTopics) {
  return isTopicRead(topicName, readTopics);
}

/**
 * Backward-compatible read check for callers that still pass parent paths.
 *
 * @param {string | null | undefined} topicName
 * @param {Set<string> | string[] | Iterable<string> | null | undefined} readTopics
 * @returns {boolean}
 */
export function isTopicRead(topicName, readTopics) {
  if (!topicName) {
    return false;
  }

  const readTopicsSet = toReadTopicsSet(readTopics);
  if (readTopicsSet.size === 0) {
    return false;
  }

  const parts = String(topicName)
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
  let currentPath = "";

  for (let i = 0; i < parts.length; i += 1) {
    currentPath = i === 0 ? parts[i] : `${currentPath}>${parts[i]}`;
    if (readTopicsSet.has(currentPath)) {
      return true;
    }
  }

  return false;
}

/**
 * @param {{ canonicalTopicNames?: string[] } | null | undefined} selection
 * @param {Set<string> | string[] | Iterable<string> | null | undefined} readTopics
 * @returns {boolean}
 */
export function isTopicSelectionRead(selection, readTopics) {
  const topicNames = getTopicSelectionCanonicalTopicNames(selection);
  if (topicNames.length === 0) {
    return false;
  }

  return topicNames.every((topicName) => isTopicRead(topicName, readTopics));
}

/**
 * @param {Set<string> | string[] | Iterable<string> | null | undefined} readTopics
 * @param {string[]} topicNames
 * @param {boolean} shouldRead
 * @returns {Set<string>}
 */
export function setTopicNamesReadState(readTopics, topicNames, shouldRead) {
  const next = new Set(toReadTopicsSet(readTopics));

  topicNames.forEach((topicName) => {
    const normalizedName =
      typeof topicName === "string" ? topicName.trim() : "";
    if (!normalizedName) {
      return;
    }

    if (shouldRead) {
      next.add(normalizedName);
    } else {
      next.delete(normalizedName);
    }
  });

  return next;
}
