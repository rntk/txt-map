function splitTopicParts(topic) {
  return String(topic?.name || "")
    .split(">")
    .map((part) => part.trim());
}

function buildTopicPrefixes(parts) {
  const prefixes = [];
  let path = "";
  for (const part of parts) {
    path = path ? `${path}>${part}` : part;
    prefixes.push(path);
  }
  return prefixes;
}

function createTopicTreeEntry({
  name,
  fullPath,
  uid,
  isLeaf,
  topic,
  depth,
  parent,
}) {
  return {
    node: {
      name,
      fullPath,
      uid,
      isLeaf,
      topic,
      depth,
    },
    children: new Map(),
    parent,
  };
}

function sortIndexedTopics(indexed) {
  indexed.sort((a, b) => {
    if (a.min !== b.min) return a.min - b.min;
    if (a.min === Infinity && b.min === Infinity) {
      return a.originalIndex - b.originalIndex;
    }
    return a.topic.name.localeCompare(b.topic.name);
  });
}

function getCommonStackDepth(stack, prefixes, startLevel, leafRelativeDepth) {
  let common = 0;
  while (
    common < stack.length &&
    common < leafRelativeDepth &&
    stack[common].node.fullPath === prefixes[startLevel + common]
  ) {
    common++;
  }
  return common;
}

function appendIntermediateEntries({
  common,
  leafRelativeDepth,
  startLevel,
  prefixes,
  parts,
  makeUid,
  roots,
  stack,
}) {
  for (let rel = common; rel < leafRelativeDepth; rel++) {
    const absDepth = startLevel + rel;
    const fullPath = prefixes[absDepth];
    const uid = makeUid(fullPath);
    const entry = createTopicTreeEntry({
      name: parts[absDepth],
      fullPath,
      uid,
      isLeaf: false,
      topic: null,
      depth: absDepth,
      parent: rel > 0 ? stack[rel - 1] : null,
    });
    if (rel === 0) {
      roots.push(entry);
    } else {
      stack[rel - 1].children.set(uid, entry);
    }
    stack.push(entry);
  }
}

function appendLeafEntry({
  parts,
  prefixes,
  makeUid,
  topic,
  leafRelativeDepth,
  roots,
  stack,
}) {
  const leafFullPath = prefixes[parts.length - 1];
  const leafUid = makeUid(leafFullPath);
  const leafEntry = createTopicTreeEntry({
    name: parts[parts.length - 1],
    fullPath: leafFullPath,
    uid: leafUid,
    isLeaf: true,
    topic,
    depth: parts.length - 1,
    parent: leafRelativeDepth > 0 ? stack[leafRelativeDepth - 1] : null,
  });
  if (leafRelativeDepth === 0) {
    roots.push(leafEntry);
    return [];
  }
  stack[leafRelativeDepth - 1].children.set(leafUid, leafEntry);
  return stack;
}

export function buildTopicTree(topics, startLevel = 0) {
  const safe = Array.isArray(topics) ? topics : [];
  const tree = new Map();

  safe.forEach((topic) => {
    const parts = splitTopicParts(topic);
    let path = "";

    for (let i = 0; i < parts.length; i++) {
      const prevPath = path;
      path = path ? `${path}>${parts[i]}` : parts[i];

      if (!tree.has(path)) {
        const isLeaf = i === parts.length - 1;
        tree.set(
          path,
          createTopicTreeEntry({
            name: parts[i],
            fullPath: path,
            uid: path,
            isLeaf,
            topic: isLeaf ? topic : null,
            depth: i,
            parent: prevPath || null,
          }),
        );
      }

      if (prevPath) {
        const parentEntry = tree.get(prevPath);
        parentEntry.children.set(parts[i], tree.get(path));
      }
    }
  });

  const roots = [];
  tree.forEach((value) => {
    if (value.node.depth === startLevel) {
      roots.push(value);
    }
  });

  roots.sort((a, b) => a.node.name.localeCompare(b.node.name));
  return roots;
}

export function buildAdjacentTopicTree(topics, startLevel = 0) {
  const safe = Array.isArray(topics) ? topics : [];

  const indexed = safe.map((topic, originalIndex) => {
    const sentences = Array.isArray(topic.sentences) ? topic.sentences : [];
    const min = sentences.length > 0 ? Math.min(...sentences) : Infinity;
    return { topic, originalIndex, min };
  });

  sortIndexedTopics(indexed);

  const roots = [];
  let stack = [];
  const occurrenceCounts = new Map();

  const makeUid = (fullPath) => {
    const n = (occurrenceCounts.get(fullPath) || 0) + 1;
    occurrenceCounts.set(fullPath, n);
    return `${fullPath}#${n}`;
  };

  for (const { topic } of indexed) {
    const parts = splitTopicParts(topic);

    if (parts.length < startLevel + 1) {
      const fullPath = parts.join(">");
      const entry = createTopicTreeEntry({
        name: parts[parts.length - 1] || "",
        fullPath,
        uid: makeUid(fullPath),
        isLeaf: true,
        topic,
        depth: parts.length - 1,
        parent: null,
      });
      roots.push(entry);
      stack = [];
      continue;
    }

    const prefixes = buildTopicPrefixes(parts);
    const leafRelativeDepth = parts.length - 1 - startLevel;

    const common = getCommonStackDepth(
      stack,
      prefixes,
      startLevel,
      leafRelativeDepth,
    );
    stack = stack.slice(0, common);

    appendIntermediateEntries({
      common,
      leafRelativeDepth,
      startLevel,
      prefixes,
      parts,
      makeUid,
      roots,
      stack,
    });
    stack = appendLeafEntry({
      parts,
      prefixes,
      makeUid,
      topic,
      leafRelativeDepth,
      roots,
      stack,
    });
  }

  return roots;
}

export function getSubtreeStats(treeNode) {
  let totalTopics = 0;
  let totalSentences = 0;

  const traverse = (node) => {
    if (node.node.isLeaf && node.node.topic) {
      totalTopics++;
      totalSentences += node.node.topic.totalSentences || 0;
    }
    node.children.forEach((child) => traverse(child));
  };

  traverse(treeNode);
  return { totalTopics, totalSentences };
}
