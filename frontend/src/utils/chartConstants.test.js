import { describe, it, expect } from 'vitest';
import { formatDate, getTopicSelectionKey } from './chartConstants';

describe('formatDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate(0)).toBe('');
  });

  it('returns string representation for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatDate('foo bar')).toBe('foo bar');
  });

  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2024-06-01T10:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for a valid date-only string', () => {
    const result = formatDate('2023-01-15');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles a numeric timestamp', () => {
    const ts = new Date('2024-01-01T00:00:00Z').getTime();
    const result = formatDate(ts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('getTopicSelectionKey', () => {
  it('returns empty string for falsy input', () => {
    expect(getTopicSelectionKey(null)).toBe('');
    expect(getTopicSelectionKey(undefined)).toBe('');
    expect(getTopicSelectionKey('')).toBe('');
  });

  it('returns name for a single topic object', () => {
    expect(getTopicSelectionKey({ name: 'Animals' })).toBe('Animals');
  });

  it('returns empty string for a topic object with no name', () => {
    expect(getTopicSelectionKey({})).toBe('');
    expect(getTopicSelectionKey({ name: '' })).toBe('');
  });

  it('returns sorted joined names for an array of topics', () => {
    const topics = [{ name: 'Zebra' }, { name: 'Animals' }, { name: 'Plants' }];
    expect(getTopicSelectionKey(topics)).toBe('Animals|Plants|Zebra');
  });

  it('returns a single name for a one-element array', () => {
    expect(getTopicSelectionKey([{ name: 'Science' }])).toBe('Science');
  });

  it('filters out entries without a name from an array', () => {
    const topics = [{ name: 'A' }, {}, { name: null }, { name: 'B' }];
    expect(getTopicSelectionKey(topics)).toBe('A|B');
  });

  it('returns empty string for an empty array', () => {
    expect(getTopicSelectionKey([])).toBe('');
  });

  it('produces the same key regardless of array order', () => {
    const a = getTopicSelectionKey([{ name: 'X' }, { name: 'Y' }]);
    const b = getTopicSelectionKey([{ name: 'Y' }, { name: 'X' }]);
    expect(a).toBe(b);
  });
});
