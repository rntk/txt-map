import { filterTopics, assembleChartProps } from './componentRegistry';

const makeTopic = name => ({ name, sentences: [1, 2, 3] });

const TOPICS = [
  makeTopic('Science'),
  makeTopic('Science > Physics'),
  makeTopic('Science > Chemistry'),
  makeTopic('Politics'),
  makeTopic('Economy'),
];

describe('filterTopics', () => {
  test('returns original array when chartSpec is null', () => {
    expect(filterTopics(TOPICS, null)).toBe(TOPICS);
  });

  test('returns original array when topics is empty', () => {
    expect(filterTopics([], { topic_filter: ['Science'] })).toEqual([]);
  });

  test('filters by topic_filter whitelist', () => {
    const result = filterTopics(TOPICS, { topic_filter: ['Science', 'Politics'] });
    expect(result.map(t => t.name)).toEqual(['Science', 'Politics']);
  });

  test('filters by scope prefix', () => {
    const result = filterTopics(TOPICS, { scope: 'Science' });
    expect(result.map(t => t.name)).toEqual(['Science', 'Science > Physics', 'Science > Chemistry']);
  });

  test('scope does not match partial string prefix without " > " separator', () => {
    // "ScientificMethod" should NOT match scope "Science" since it doesn't start with "Science > "
    const topics = [makeTopic('Science'), makeTopic('ScientificMethod'), makeTopic('Politics'), makeTopic('Economy')];
    const result = filterTopics(topics, { scope: 'Science' });
    // Only 'Science' matches but that's 1 topic < MIN_FILTERED_TOPICS → fallback to all
    expect(result).toBe(topics);
    expect(result.some(t => t.name === 'ScientificMethod')).toBe(true);
  });

  test('topic_filter takes precedence over scope', () => {
    const result = filterTopics(TOPICS, { topic_filter: ['Politics', 'Economy'], scope: 'Science' });
    expect(result.map(t => t.name)).toEqual(['Politics', 'Economy']);
  });

  test('falls back to unfiltered when fewer than 2 topics match topic_filter', () => {
    const result = filterTopics(TOPICS, { topic_filter: ['Science'] });
    expect(result).toBe(TOPICS);
  });

  test('falls back to unfiltered when fewer than 2 topics match scope', () => {
    const result = filterTopics(TOPICS, { scope: 'Politics' });
    expect(result).toBe(TOPICS);
  });

  test('returns exactly 2 topics without fallback', () => {
    const result = filterTopics(TOPICS, { topic_filter: ['Science', 'Politics'] });
    expect(result).toHaveLength(2);
    expect(result).not.toBe(TOPICS);
  });

  test('ignores empty topic_filter array', () => {
    const result = filterTopics(TOPICS, { topic_filter: [], scope: 'Science' });
    // Empty topic_filter → falls through to scope filter
    expect(result.map(t => t.name)).toEqual(['Science', 'Science > Physics', 'Science > Chemistry']);
  });

  test('returns original when both topic_filter is empty and scope is null', () => {
    const result = filterTopics(TOPICS, { topic_filter: [], scope: null });
    expect(result).toBe(TOPICS);
  });
});

describe('assembleChartProps', () => {
  const ctx = {
    topics: TOPICS,
    sentences: ['s1', 's2', 's3'],
    submissionId: 'test-123',
  };

  test('returns null for unknown component', () => {
    expect(assembleChartProps('UnknownChart', ctx)).toBeNull();
  });

  test('passes full topics when chartSpec is null', () => {
    const props = assembleChartProps('TreemapChart', ctx, null);
    expect(props.topics).toBe(TOPICS);
  });

  test('passes filtered topics when chartSpec has topic_filter', () => {
    const chartSpec = { topic_filter: ['Science', 'Politics'] };
    const props = assembleChartProps('TreemapChart', ctx, chartSpec);
    expect(props.topics.map(t => t.name)).toEqual(['Science', 'Politics']);
  });

  test('passes full topics when no chartSpec argument provided (default)', () => {
    const props = assembleChartProps('TreemapChart', ctx);
    expect(props.topics).toBe(TOPICS);
  });
});
