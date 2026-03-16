export function buildMindmapHierarchy(data) {
  if (!data || Object.keys(data).length === 0) return null;

  const roots = [];

  Object.entries(data).forEach(([topicKey, topicData]) => {
    const buildChildren = (nodeData, parentPath = '', key = '') => {
      const children = nodeData.children || {};
      const currentPath = parentPath ? `${parentPath}/${key}` : key;
      return Object.entries(children).map(([childKey, childData]) => ({
        name: childKey,
        sentences: childData.sentences || [],
        children: buildChildren(childData, currentPath, childKey),
        path: `${currentPath}/${childKey}`
      }));
    };

    roots.push({
      name: topicKey,
      sentences: topicData.sentences || [],
      children: buildChildren(topicData, '', topicKey),
      path: topicKey
    });
  });

  return roots;
}

export function buildPrefixTreeHierarchy(data) {
  if (!data || Object.keys(data).length === 0) return null;

  const roots = [];

  const buildNode = (label, nodeData, parentPath = '') => {
    const fullWord = nodeData.fullWord || label;
    const currentPath = parentPath ? `${parentPath}/${label}` : label;
    return {
      name: label,
      fullWord,
      count: nodeData.count || 0,
      sentences: nodeData.sentences || [],
      path: currentPath,
      children: Object.entries(nodeData.children || {}).map(([childLabel, childData]) =>
        buildNode(childLabel, childData, currentPath)
      )
    };
  };

  Object.entries(data).forEach(([label, nodeData]) => {
    roots.push(buildNode(label, nodeData, ''));
  });

  return roots;
}
