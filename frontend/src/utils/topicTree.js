export function buildTopicTree(topics, startLevel = 0) {
  const safe = Array.isArray(topics) ? topics : [];
  const tree = new Map();

  safe.forEach((topic) => {
    const parts = topic.name.split(">").map((p) => p.trim());
    let path = "";

    for (let i = 0; i < parts.length; i++) {
      const prevPath = path;
      path = path ? `${path}>${parts[i]}` : parts[i];

      if (!tree.has(path)) {
        const isLeaf = i === parts.length - 1;
        tree.set(path, {
          node: {
            name: parts[i],
            fullPath: path,
            uid: path,
            isLeaf,
            topic: isLeaf ? topic : null,
            depth: i,
          },
          children: new Map(),
          parent: prevPath || null,
        });
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

  indexed.sort((a, b) => {
    if (a.min !== b.min) return a.min - b.min;
    if (a.min === Infinity && b.min === Infinity) {
      return a.originalIndex - b.originalIndex;
    }
    return a.topic.name.localeCompare(b.topic.name);
  });

  const roots = [];
  let stack = [];
  const occurrenceCounts = new Map();

  const makeUid = (fullPath) => {
    const n = (occurrenceCounts.get(fullPath) || 0) + 1;
    occurrenceCounts.set(fullPath, n);
    return `${fullPath}#${n}`;
  };

  for (const { topic } of indexed) {
    const parts = topic.name.split(">").map((p) => p.trim());

    if (parts.length < startLevel + 1) {
      const fullPath = parts.join(">");
      const uid = makeUid(fullPath);
      const entry = {
        node: {
          name: parts[parts.length - 1] || "",
          fullPath,
          uid,
          isLeaf: true,
          topic,
          depth: parts.length - 1,
        },
        children: new Map(),
        parent: null,
      };
      roots.push(entry);
      stack = [];
      continue;
    }

    const prefixes = [];
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      acc = acc ? `${acc}>${parts[i]}` : parts[i];
      prefixes.push(acc);
    }

    const leafRelativeDepth = parts.length - 1 - startLevel;

    let common = 0;
    while (
      common < stack.length &&
      common < leafRelativeDepth &&
      stack[common].node.fullPath === prefixes[startLevel + common]
    ) {
      common++;
    }
    stack = stack.slice(0, common);

    for (let rel = common; rel < leafRelativeDepth; rel++) {
      const absDepth = startLevel + rel;
      const fullPath = prefixes[absDepth];
      const uid = makeUid(fullPath);
      const entry = {
        node: {
          name: parts[absDepth],
          fullPath,
          uid,
          isLeaf: false,
          topic: null,
          depth: absDepth,
        },
        children: new Map(),
        parent: rel > 0 ? stack[rel - 1] : null,
      };
      if (rel === 0) {
        roots.push(entry);
      } else {
        stack[rel - 1].children.set(uid, entry);
      }
      stack.push(entry);
    }

    const leafFullPath = prefixes[parts.length - 1];
    const leafUid = makeUid(leafFullPath);
    const leafEntry = {
      node: {
        name: parts[parts.length - 1],
        fullPath: leafFullPath,
        uid: leafUid,
        isLeaf: true,
        topic,
        depth: parts.length - 1,
      },
      children: new Map(),
      parent: leafRelativeDepth > 0 ? stack[leafRelativeDepth - 1] : null,
    };
    if (leafRelativeDepth === 0) {
      roots.push(leafEntry);
      stack = [];
    } else {
      stack[leafRelativeDepth - 1].children.set(leafUid, leafEntry);
    }
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
