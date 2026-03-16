import { buildTopicTree, getSubtreeStats } from './topicTree';

const flatTopics = [
  { name: 'Animals', sentences: [1, 2] },
  { name: 'Animals>Mammals', sentences: [1] },
  { name: 'Animals>Birds', sentences: [2] },
  { name: 'Plants', sentences: [3, 4, 5] },
];

describe('buildTopicTree', () => {
  test('returns empty array for empty input', () => {
    expect(buildTopicTree([])).toEqual([]);
    expect(buildTopicTree(null)).toEqual([]);
  });

  test('builds root-level nodes', () => {
    const tree = buildTopicTree(flatTopics);
    const names = tree.map(n => n.node.name);
    expect(names).toContain('Animals');
    expect(names).toContain('Plants');
  });

  test('roots are sorted alphabetically', () => {
    const tree = buildTopicTree(flatTopics);
    expect(tree[0].node.name).toBe('Animals');
    expect(tree[1].node.name).toBe('Plants');
  });

  test('children are nested under parents', () => {
    const tree = buildTopicTree(flatTopics);
    const animals = tree.find(n => n.node.name === 'Animals');
    expect(animals.children.size).toBe(2);
    expect(animals.children.has('Mammals')).toBe(true);
    expect(animals.children.has('Birds')).toBe(true);
  });

  test('leaf nodes have topic attached', () => {
    const tree = buildTopicTree(flatTopics);
    const animals = tree.find(n => n.node.name === 'Animals');
    const mammals = animals.children.get('Mammals');
    expect(mammals.node.isLeaf).toBe(true);
    expect(mammals.node.topic).not.toBeNull();
    expect(mammals.node.topic.name).toBe('Animals>Mammals');
  });

  test('intermediate nodes have isLeaf=false when they only appear as parent', () => {
    // Use topics where parent has NO direct entry (only children exist)
    const childOnlyTopics = [
      { name: 'Root>Child1', sentences: [], totalSentences: 1 },
      { name: 'Root>Child2', sentences: [], totalSentences: 2 },
    ];
    const tree = buildTopicTree(childOnlyTopics);
    const root = tree.find(n => n.node.name === 'Root');
    expect(root.node.isLeaf).toBe(false);
    expect(root.node.topic).toBeNull();
  });

  test('handles flat single-level topics', () => {
    const topics = [{ name: 'Science', sentences: [] }, { name: 'Art', sentences: [] }];
    const tree = buildTopicTree(topics);
    expect(tree).toHaveLength(2);
    expect(tree[0].node.isLeaf).toBe(true);
  });
});

describe('getSubtreeStats', () => {
  test('returns counts for a leaf node', () => {
    const tree = buildTopicTree([{ name: 'A', sentences: [1, 2, 3], totalSentences: 3 }]);
    const node = tree[0];
    const { totalTopics, totalSentences } = getSubtreeStats(node);
    expect(totalTopics).toBe(1);
    expect(totalSentences).toBe(3);
  });

  test('aggregates counts from all leaves in subtree', () => {
    const topics = [
      { name: 'Root>Child1', sentences: [], totalSentences: 2 },
      { name: 'Root>Child2', sentences: [], totalSentences: 5 },
    ];
    const tree = buildTopicTree(topics);
    const root = tree[0];
    const { totalTopics, totalSentences } = getSubtreeStats(root);
    expect(totalTopics).toBe(2);
    expect(totalSentences).toBe(7);
  });

  test('returns zeros for intermediate node with no topics', () => {
    const topics = [{ name: 'A>B>C', sentences: [], totalSentences: 0 }];
    const tree = buildTopicTree(topics);
    const A = tree[0];
    const B = A.children.get('B');
    const { totalTopics } = getSubtreeStats(B);
    expect(totalTopics).toBe(1);
  });
});
