export function buildDiffRows(diffState) {
  if (!diffState?.diff) return [];

  const leftNodes = new Map();
  const rightNodes = new Map();
  const allEdges = [];

  const processRow = (row) => {
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
  };

  (diffState.diff.matches_left_to_right || []).forEach(processRow);
  (diffState.diff.matches_right_to_left || []).forEach(processRow);
  (diffState.diff.nearest_left_to_right || []).forEach(processRow);
  (diffState.diff.nearest_right_to_left || []).forEach(processRow);
  (diffState.diff.unmatched_left || []).forEach(processRow);
  (diffState.diff.unmatched_right || []).forEach(processRow);

  const dedupEdges = new Map();
  allEdges.forEach((e) => {
    const k = `${e.left}-${e.right}`;
    if (!dedupEdges.has(k) || dedupEdges.get(k).sim < e.sim) {
      dedupEdges.set(k, e);
    }
  });
  const sortedEdges = Array.from(dedupEdges.values()).sort(
    (a, b) => b.sim - a.sim,
  );

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

  const renderedLeft = new Set();
  const renderedRight = new Set();
  const displayRows = [];

  // Phase 1: greedy pairing
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

  // Phase 2: Add remaining unrendered left nodes
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

  // Phase 3: Add remaining unrendered right nodes
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

  // Sort displayRows by left sentence index, then right sentence index
  displayRows.sort((a, b) => {
    const aLeft = a.hasLeft ? a.leftData.index : Infinity;
    const bLeft = b.hasLeft ? b.leftData.index : Infinity;
    if (aLeft !== bLeft) return aLeft - bLeft;

    const aRight = a.hasRight ? a.rightData.index : Infinity;
    const bRight = b.hasRight ? b.rightData.index : Infinity;
    return aRight - bRight;
  });

  return displayRows.map((row, index) => {
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
  });
}
