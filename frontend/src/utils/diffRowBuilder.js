function processRow(row, leftNodes, rightNodes, allEdges) {
  if (!row) return;
  if (row.left_sentence_index != null) {
    leftNodes.set(row.left_sentence_index, {
      topic: row.left_topic,
      text: row.left_text,
      index: row.left_sentence_index,
    });
  }
  if (row.right_sentence_index != null) {
    rightNodes.set(row.right_sentence_index, {
      topic: row.right_topic,
      text: row.right_text,
      index: row.right_sentence_index,
    });
  }
  if (
    row.left_sentence_index != null &&
    row.right_sentence_index != null &&
    row.similarity != null &&
    row.similarity > 0
  ) {
    allEdges.push({
      left: row.left_sentence_index,
      right: row.right_sentence_index,
      sim: row.similarity,
    });
  }
}

function collectNodesAndEdges(diffState) {
  const leftNodes = new Map();
  const rightNodes = new Map();
  const allEdges = [];
  const bind = (row) => processRow(row, leftNodes, rightNodes, allEdges);

  (diffState.diff.matches_left_to_right || []).forEach(bind);
  (diffState.diff.matches_right_to_left || []).forEach(bind);
  (diffState.diff.nearest_left_to_right || []).forEach(bind);
  (diffState.diff.nearest_right_to_left || []).forEach(bind);
  (diffState.diff.unmatched_left || []).forEach(bind);
  (diffState.diff.unmatched_right || []).forEach(bind);

  return { leftNodes, rightNodes, allEdges };
}

function deduplicateAndSortEdges(allEdges) {
  const dedupEdges = new Map();
  allEdges.forEach((e) => {
    const k = `${e.left}-${e.right}`;
    if (!dedupEdges.has(k) || dedupEdges.get(k).sim < e.sim) {
      dedupEdges.set(k, e);
    }
  });
  return Array.from(dedupEdges.values()).sort((a, b) => b.sim - a.sim);
}

function buildNearestMaps(sortedEdges, leftNodes, rightNodes) {
  const nearestRightMap = {};
  const nearestLeftMap = {};

  sortedEdges.forEach((e) => {
    if (!nearestRightMap[e.left]) nearestRightMap[e.left] = [];
    nearestRightMap[e.left].push({
      right_sentence_index: e.right,
      similarity: e.sim,
      right_topic: rightNodes.get(e.right)?.topic,
    });

    if (!nearestLeftMap[e.right]) nearestLeftMap[e.right] = [];
    nearestLeftMap[e.right].push({
      left_sentence_index: e.left,
      similarity: e.sim,
      left_topic: leftNodes.get(e.left)?.topic,
    });
  });

  return { nearestRightMap, nearestLeftMap };
}

function buildDisplayRows(sortedEdges, leftNodes, rightNodes) {
  const renderedLeft = new Set();
  const renderedRight = new Set();
  const displayRows = [];

  sortedEdges.forEach((e) => {
    if (!renderedLeft.has(e.left) && !renderedRight.has(e.right)) {
      renderedLeft.add(e.left);
      renderedRight.add(e.right);
      displayRows.push({
        hasLeft: true,
        hasRight: true,
        leftData: leftNodes.get(e.left),
        rightData: rightNodes.get(e.right),
        similarity: e.sim,
      });
    }
  });

  Array.from(leftNodes.values()).forEach((node) => {
    if (!renderedLeft.has(node.index)) {
      displayRows.push({
        hasLeft: true,
        hasRight: false,
        leftData: node,
        rightData: null,
        similarity: 0,
      });
    }
  });

  Array.from(rightNodes.values()).forEach((node) => {
    if (!renderedRight.has(node.index)) {
      displayRows.push({
        hasLeft: false,
        hasRight: true,
        leftData: null,
        rightData: node,
        similarity: 0,
      });
    }
  });

  displayRows.sort((a, b) => {
    const aLeft = a.hasLeft ? a.leftData.index : Infinity;
    const bLeft = b.hasLeft ? b.leftData.index : Infinity;
    if (aLeft !== bLeft) return aLeft - bLeft;
    const aRight = a.hasRight ? a.rightData.index : Infinity;
    const bRight = b.hasRight ? b.rightData.index : Infinity;
    return aRight - bRight;
  });

  return displayRows;
}

function mapToOutputRow(row, index, nearestRightMap, nearestLeftMap) {
  let nearestRight = [];
  if (row.hasLeft) {
    const allRight = nearestRightMap[row.leftData.index] || [];
    nearestRight = allRight
      .filter(
        (r) =>
          !row.hasRight || r.right_sentence_index !== row.rightData.index,
      )
      .slice(0, 5);
  }

  let nearestLeft = [];
  if (row.hasRight) {
    const allLeft = nearestLeftMap[row.rightData.index] || [];
    nearestLeft = allLeft
      .filter(
        (l) => !row.hasLeft || l.left_sentence_index !== row.leftData.index,
      )
      .slice(0, 5);
  }

  const kind =
    row.hasLeft && row.hasRight
      ? "match"
      : row.hasLeft
        ? "unmatched-left"
        : "unmatched-right";

  return {
    id: `row-${index}`,
    kind,
    hasLeft: row.hasLeft,
    hasRight: row.hasRight,
    similarity: row.similarity,
    leftTopic: row.hasLeft ? row.leftData.topic : null,
    leftText: row.hasLeft ? row.leftData.text : null,
    leftSentenceIndex: row.hasLeft ? row.leftData.index : null,
    rightTopic: row.hasRight ? row.rightData.topic : null,
    rightText: row.hasRight ? row.rightData.text : null,
    rightSentenceIndex: row.hasRight ? row.rightData.index : null,
    nearestRight,
    nearestLeft,
  };
}

export function buildDiffRows(diffState) {
  if (!diffState?.diff) return [];
  const { leftNodes, rightNodes, allEdges } = collectNodesAndEdges(diffState);
  const sortedEdges = deduplicateAndSortEdges(allEdges);
  const { nearestRightMap, nearestLeftMap } = buildNearestMaps(
    sortedEdges,
    leftNodes,
    rightNodes,
  );
  const displayRows = buildDisplayRows(sortedEdges, leftNodes, rightNodes);
  return displayRows.map((row, index) =>
    mapToOutputRow(row, index, nearestRightMap, nearestLeftMap),
  );
}
