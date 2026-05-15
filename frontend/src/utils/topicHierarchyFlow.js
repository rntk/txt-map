import { getTopicParts } from "./topicHierarchy";

const FALLBACK_WEIGHT = 1;

/**
 * @typedef {Object} TopicHierarchyFlowTopic
 * @property {string} [name]
 * @property {number[]} [sentences]
 * @property {number[]} [sentenceIndices]
 * @property {Array<unknown>} [ranges]
 * @property {number} [totalSentences]
 *
 * @typedef {Object} TopicHierarchyFlowNode
 * @property {string} id
 * @property {"leaf" | "hierarchy"} type
 * @property {string} label
 * @property {string} fullPath
 * @property {number} column
 * @property {number} depth
 * @property {number} weight
 * @property {number[]} sentenceIndices
 * @property {string[]} canonicalTopicNames
 * @property {Array<unknown>} ranges
 * @property {string} colorKey
 * @property {number} order
 *
 * @typedef {Object} TopicHierarchyFlowLink
 * @property {string} id
 * @property {string} sourceId
 * @property {string} targetId
 * @property {number} weight
 * @property {number[]} sentenceIndices
 * @property {string[]} canonicalTopicNames
 * @property {Array<unknown>} ranges
 * @property {string} colorKey
 * @property {number} order
 *
 * @typedef {Object} TopicHierarchyFlowColumn
 * @property {number} index
 * @property {string} label
 * @property {TopicHierarchyFlowNode[]} nodes
 *
 * @typedef {Object} TopicHierarchyFlowData
 * @property {number} maxDepth
 * @property {TopicHierarchyFlowColumn[]} columns
 * @property {TopicHierarchyFlowNode[]} nodes
 * @property {TopicHierarchyFlowLink[]} links
 */

/**
 * @param {unknown} topic
 * @returns {number[]}
 */
function getSentenceIndices(topic) {
  const source = Array.isArray(topic?.sentenceIndices)
    ? topic.sentenceIndices
    : Array.isArray(topic?.sentences)
      ? topic.sentences
      : [];

  return [...new Set(source)]
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right);
}

/**
 * @param {unknown} topic
 * @returns {Array<unknown>}
 */
function getRanges(topic) {
  return Array.isArray(topic?.ranges) ? topic.ranges : [];
}

/**
 * @param {TopicHierarchyFlowTopic} topic
 * @returns {number}
 */
export function getTopicHierarchyFlowWeight(topic) {
  const sentenceIndices = getSentenceIndices(topic);
  if (sentenceIndices.length > 0) {
    return sentenceIndices.length;
  }

  if (Number.isFinite(topic?.totalSentences) && topic.totalSentences > 0) {
    return topic.totalSentences;
  }

  return FALLBACK_WEIGHT;
}

function getOrCreateHierarchyNode(nodeMap, path, label, { depth, column, colorKey }) {
  const nodeId = `hierarchy:${path}`;
  const existing = nodeMap.get(nodeId);
  if (existing) return existing;
  const node = {
    id: nodeId,
    type: "hierarchy",
    label,
    fullPath: path,
    column,
    depth,
    weight: 0,
    sentenceIndices: [],
    canonicalTopicNames: [],
    ranges: [],
    colorKey,
    order: 0,
    orderValues: [],
    sentenceIndexSet: new Set(),
    canonicalTopicNameSet: new Set(),
  };
  nodeMap.set(nodeId, node);
  return node;
}

function processTopic(nodeMap, linkMap, maxDepth, topic, topicIndex) {
  const topicName = topic.name.trim();
  const parts = getTopicParts(topicName);
  if (parts.length === 0) return;

  const weight = getTopicHierarchyFlowWeight(topic);
  const sentenceIndices = getSentenceIndices(topic);
  const ranges = getRanges(topic);
  const colorKey = parts[0];
  const leafId = `leaf:${topicName}`;

  nodeMap.set(leafId, {
    id: leafId,
    type: "leaf",
    label: topicName,
    fullPath: topicName,
    column: 0,
    depth: parts.length - 1,
    weight,
    sentenceIndices,
    canonicalTopicNames: [topicName],
    ranges,
    colorKey,
    order: topicIndex,
    orderValues: [topicIndex],
    sentenceIndexSet: new Set(sentenceIndices),
    canonicalTopicNameSet: new Set([topicName]),
  });

  const hierarchyNodeIds = [];
  parts.forEach((part, depth) => {
    const path = parts.slice(0, depth + 1).join(">");
    const column = maxDepth - depth;
    const node = getOrCreateHierarchyNode(nodeMap, path, part, { depth, column, colorKey });
    node.weight += weight;
    node.orderValues.push(topicIndex);
    node.canonicalTopicNameSet.add(topicName);
    sentenceIndices.forEach((value) => node.sentenceIndexSet.add(value));
    node.ranges.push(...ranges);
    hierarchyNodeIds.push(node.id);
  });

  const deepestHierarchyId = hierarchyNodeIds[hierarchyNodeIds.length - 1];
  if (deepestHierarchyId) {
    const leafLinkId = `${leafId}->${deepestHierarchyId}`;
    const leafLink = linkMap.get(leafLinkId) || {
      id: leafLinkId, sourceId: leafId, targetId: deepestHierarchyId,
      weight: 0, sentenceIndices: [], canonicalTopicNames: [], ranges: [],
      colorKey, order: topicIndex, orderValues: [],
      sentenceIndexSet: new Set(), canonicalTopicNameSet: new Set(),
    };
    leafLink.weight += weight;
    leafLink.orderValues.push(topicIndex);
    leafLink.canonicalTopicNameSet.add(topicName);
    sentenceIndices.forEach((value) => leafLink.sentenceIndexSet.add(value));
    leafLink.ranges.push(...ranges);
    linkMap.set(leafLinkId, leafLink);
  }

  for (let i = hierarchyNodeIds.length - 1; i > 0; i -= 1) {
    const linkId = `${hierarchyNodeIds[i]}->${hierarchyNodeIds[i - 1]}`;
    const link = linkMap.get(linkId) || {
      id: linkId, sourceId: hierarchyNodeIds[i], targetId: hierarchyNodeIds[i - 1],
      weight: 0, sentenceIndices: [], canonicalTopicNames: [], ranges: [],
      colorKey, order: topicIndex, orderValues: [],
      sentenceIndexSet: new Set(), canonicalTopicNameSet: new Set(),
    };
    link.weight += weight;
    link.orderValues.push(topicIndex);
    link.canonicalTopicNameSet.add(topicName);
    sentenceIndices.forEach((value) => link.sentenceIndexSet.add(value));
    link.ranges.push(...ranges);
    linkMap.set(linkId, link);
  }
}

function buildNodeAndLinkMaps(sortedTopics, maxDepth) {
  const nodeMap = new Map();
  const linkMap = new Map();
  sortedTopics.forEach((topic, topicIndex) =>
    processTopic(nodeMap, linkMap, maxDepth, topic, topicIndex),
  );
  return { nodeMap, linkMap };
}

function finalizeNodes(nodeMap) {
  return Array.from(nodeMap.values())
    .map((node) => ({
      ...node,
      sentenceIndices: Array.from(node.sentenceIndexSet).sort((l, r) => l - r),
      canonicalTopicNames: Array.from(node.canonicalTopicNameSet).sort(),
      order:
        node.orderValues.reduce((sum, v) => sum + v, 0) /
        Math.max(1, node.orderValues.length),
    }))
    .sort(
      (l, r) =>
        l.column - r.column ||
        l.order - r.order ||
        l.fullPath.localeCompare(r.fullPath),
    );
}

function finalizeLinks(linkMap) {
  return Array.from(linkMap.values())
    .map((link) => ({
      ...link,
      sentenceIndices: Array.from(link.sentenceIndexSet).sort((l, r) => l - r),
      canonicalTopicNames: Array.from(link.canonicalTopicNameSet).sort(),
      order:
        link.orderValues.reduce((sum, v) => sum + v, 0) /
        Math.max(1, link.orderValues.length),
    }))
    .sort((l, r) => l.order - r.order || l.id.localeCompare(r.id));
}

function buildColumns(nodes, maxDepth) {
  const columnLabels = Array.from({ length: maxDepth + 1 }, (_, index) => {
    if (index === 0) return "Leaf Topics";
    if (index === maxDepth) return "Top-Level Topics";
    return "Subtopics";
  });
  return columnLabels.map((label, index) => ({
    index,
    label,
    nodes: nodes
      .filter((node) => node.column === index)
      .sort(
        (l, r) =>
          l.order - r.order || l.fullPath.localeCompare(r.fullPath),
      ),
  }));
}

/**
 * @param {TopicHierarchyFlowTopic[]} topics
 * @returns {TopicHierarchyFlowData}
 */
export function buildTopicHierarchyFlowData(topics) {
  const safeTopics = Array.isArray(topics)
    ? topics.filter(
        (topic) => typeof topic?.name === "string" && topic.name.trim().length,
      )
    : [];

  if (safeTopics.length === 0) {
    return { maxDepth: 0, columns: [], nodes: [], links: [] };
  }

  const sortedTopics = [...safeTopics].sort((l, r) =>
    l.name.localeCompare(r.name),
  );
  const maxDepth = Math.max(
    ...sortedTopics.map((topic) => getTopicParts(topic).length),
  );

  const { nodeMap, linkMap } = buildNodeAndLinkMaps(sortedTopics, maxDepth);
  const nodes = finalizeNodes(nodeMap);
  const links = finalizeLinks(linkMap);
  const columns = buildColumns(nodes, maxDepth);

  return { maxDepth, columns, nodes, links };
}
