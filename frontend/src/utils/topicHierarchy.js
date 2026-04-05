/**
 * @typedef {Object} TopicHierarchyInput
 * @property {string} [name]
 * @property {number[]} [sentences]
 */

/**
 * @typedef {Object} ScopedHierarchyNode
 * @property {string} name
 * @property {string} fullPath
 * @property {number} [value]
 * @property {ScopedHierarchyNode[]} children
 * @property {TopicHierarchyInput | null} [topic]
 */

export function getTopicParts(topicOrName) {
  const raw = typeof topicOrName === "string" ? topicOrName : topicOrName?.name;
  return String(raw || "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isWithinScope(parts, scopePath) {
  if (scopePath.length === 0) return true;
  if (parts.length < scopePath.length) return false;
  return scopePath.every((segment, index) => parts[index] === segment);
}

export function getScopeLabel(scopePath) {
  return scopePath.length === 0
    ? "All Topics"
    : scopePath[scopePath.length - 1];
}

export function getLevelLabel(level) {
  if (level === 0) return "Main Topics";
  if (level === 1) return "Subtopics";
  return `Depth ${level}`;
}

export function sanitizePathForTestId(path) {
  return (
    String(path || "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "root"
  );
}

export function hasDeeperChildren(topics, fullPath) {
  const baseParts = getTopicParts(fullPath);
  return (topics || []).some((topic) => {
    const parts = getTopicParts(topic);
    return parts.length > baseParts.length && isWithinScope(parts, baseParts);
  });
}

export function getDirectChildLabels(topics, fullPath) {
  const baseParts = getTopicParts(fullPath);
  const childLabels = new Set();

  (topics || []).forEach((topic) => {
    const parts = getTopicParts(topic);
    if (!isWithinScope(parts, baseParts) || parts.length <= baseParts.length) {
      return;
    }

    const childLabel = parts[baseParts.length];
    if (childLabel) {
      childLabels.add(childLabel);
    }
  });

  return Array.from(childLabels).sort((a, b) => a.localeCompare(b));
}

export function getScopedMaxLevel(topics, scopePath = []) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  let maxLevel = 0;

  safeTopics.forEach((topic) => {
    const parts = getTopicParts(topic);
    if (!isWithinScope(parts, scopePath) || parts.length <= scopePath.length) {
      return;
    }

    const relativeLevel = parts.length - scopePath.length - 1;
    if (relativeLevel > maxLevel) {
      maxLevel = relativeLevel;
    }
  });

  return maxLevel;
}

/**
 * Build a relative hierarchy for scoped chart renderers.
 *
 * @param {TopicHierarchyInput[]} topics
 * @param {string[]} [scopePath=[]]
 * @param {number} [selectedLevel=0]
 * @returns {ScopedHierarchyNode}
 */
export function buildScopedHierarchy(
  topics,
  scopePath = [],
  selectedLevel = 0,
) {
  /** @type {ScopedHierarchyNode} */
  const root = { name: "root", fullPath: "", children: [] };
  /** @type {Map<string, ScopedHierarchyNode>} */
  const nodeMap = new Map();
  nodeMap.set("", root);

  const safeTopics = Array.isArray(topics) ? topics : [];
  const safeLevel = Math.max(0, selectedLevel);
  const absoluteDepth = scopePath.length + safeLevel;

  const sorted = [...safeTopics].sort(
    (a, b) => getTopicParts(a).length - getTopicParts(b).length,
  );

  sorted.forEach((topic) => {
    const parts = getTopicParts(topic);
    if (!isWithinScope(parts, scopePath) || parts.length <= absoluteDepth) {
      return;
    }

    const visibleParts = parts.slice(absoluteDepth);

    for (let index = 0; index < visibleParts.length; index += 1) {
      const segment = visibleParts[index];
      const originalParts = parts.slice(0, absoluteDepth + index + 1);
      const pathKey = originalParts.join(">");
      const parentPath =
        index === 0 ? "" : parts.slice(0, absoluteDepth + index).join(">");

      if (!nodeMap.has(pathKey)) {
        const isLeaf = index === visibleParts.length - 1;
        /** @type {ScopedHierarchyNode} */
        const node = {
          name: segment,
          fullPath: pathKey,
          value: isLeaf
            ? Math.max(
                1,
                Array.isArray(topic.sentences) ? topic.sentences.length : 1,
              )
            : 0,
          children: [],
          topic: isLeaf ? topic : null,
        };

        nodeMap.set(pathKey, node);

        const parent = nodeMap.get(parentPath);
        if (parent) {
          parent.children.push(node);
        }
      }
    }
  });

  return root;
}

export function buildScopedChartData(
  topics,
  sentences = [],
  scopePath = [],
  selectedLevel = 0,
) {
  if (!Array.isArray(topics) || topics.length === 0) return [];

  const levelMap = new Map();
  const hasSentenceText = Array.isArray(sentences) && sentences.length > 0;
  const absoluteDepth = scopePath.length + selectedLevel + 1;

  topics.forEach((topic) => {
    const parts = getTopicParts(topic);
    if (!isWithinScope(parts, scopePath) || parts.length < absoluteDepth) {
      return;
    }

    const groupParts = parts.slice(0, absoluteDepth);
    const key = groupParts.join(">");

    if (!levelMap.has(key)) {
      levelMap.set(key, {
        name: key,
        fullPath: key,
        displayName: groupParts[groupParts.length - 1] || key,
        sentenceIndices: new Set(),
        ranges: [],
        canonicalTopicNames: new Set(),
        fallbackChars: 0,
      });
    }

    const entry = levelMap.get(key);
    const indices = Array.isArray(topic.sentences) ? topic.sentences : [];

    if (indices.length > 0) {
      indices.forEach((idx) => {
        const n = Number(idx);
        if (Number.isInteger(n) && n > 0) entry.sentenceIndices.add(n);
      });
    } else if (!hasSentenceText && Number.isFinite(topic.totalChars)) {
      entry.fallbackChars += topic.totalChars;
    }

    if (Array.isArray(topic.ranges) && topic.ranges.length > 0) {
      entry.ranges.push(...topic.ranges);
    }

    if (typeof topic.name === "string" && topic.name.trim()) {
      entry.canonicalTopicNames.add(topic.name.trim());
    }
  });

  return Array.from(levelMap.values())
    .map((entry) => {
      let totalChars = 0;
      if (hasSentenceText) {
        entry.sentenceIndices.forEach((n) => {
          const sentence = sentences[n - 1];
          if (typeof sentence === "string") totalChars += sentence.length;
        });
      } else {
        totalChars = entry.fallbackChars;
      }

      const indices = Array.from(entry.sentenceIndices);
      const firstSentence =
        indices.length > 0 ? Math.min(...indices) : Infinity;

      return {
        name: entry.name,
        fullPath: entry.fullPath,
        displayName: entry.displayName,
        totalChars,
        sentenceCount: entry.sentenceIndices.size,
        sentenceIndices: indices,
        canonicalTopicNames: Array.from(entry.canonicalTopicNames).sort(),
        ranges: entry.ranges
          .filter(
            (range) =>
              range &&
              (Number.isInteger(range.sentence_start) ||
                Number.isInteger(range.sentence_end)),
          )
          .sort((left, right) => {
            const leftStart = Number.isInteger(left.sentence_start)
              ? left.sentence_start
              : Number.MAX_SAFE_INTEGER;
            const rightStart = Number.isInteger(right.sentence_start)
              ? right.sentence_start
              : Number.MAX_SAFE_INTEGER;
            return leftStart - rightStart;
          }),
        firstSentence,
      };
    })
    .filter((item) => item.sentenceCount > 0 || item.totalChars > 0)
    .sort((a, b) => a.firstSentence - b.firstSentence);
}
