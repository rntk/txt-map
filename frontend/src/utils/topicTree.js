export function buildTopicTree(topics) {
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
    if (value.node.depth === 0) {
      roots.push(value);
    }
  });

  roots.sort((a, b) => a.node.name.localeCompare(b.node.name));
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
