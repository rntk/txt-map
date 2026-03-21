import {
  buildExtractionKey,
  buildExtractionTextSegments,
  extractionIncludesSentence,
  getExtractionValues,
} from './extractionHighlight';

describe('buildExtractionKey', () => {
  test('creates a stable key from label, sources, and values', () => {
    expect(buildExtractionKey({
      label: 'Revenue growth',
      source_sentences: [2, 3],
      values: [{ key: 'Europe', value: '48%' }],
    })).toBe('Revenue growth__2,3__Europe:48%');
  });

  test('returns empty string for invalid extraction input', () => {
    expect(buildExtractionKey(null)).toBe('');
  });
});

describe('getExtractionValues', () => {
  test('returns trimmed non-empty values only', () => {
    expect(getExtractionValues({
      values: [
        { value: ' 48% ' },
        { value: '' },
        { value: 'Europe' },
      ],
    })).toEqual(['48%', 'Europe']);
  });
});

describe('extractionIncludesSentence', () => {
  test('checks source sentence membership', () => {
    expect(extractionIncludesSentence({ source_sentences: [2, 4] }, 2)).toBe(true);
    expect(extractionIncludesSentence({ source_sentences: [2, 4] }, 3)).toBe(false);
  });
});

describe('buildExtractionTextSegments', () => {
  test('matches values case-insensitively', () => {
    const segments = buildExtractionTextSegments('Revenue grew by 48% in Europe.', {
      values: [{ value: '48%' }, { value: 'europe' }],
    });

    expect(segments.filter((segment) => segment.highlighted).map((segment) => segment.text))
      .toEqual(['48%', 'Europe']);
  });

  test('highlights repeated occurrences', () => {
    const segments = buildExtractionTextSegments('48% today, 48% tomorrow.', {
      values: [{ value: '48%' }],
    });

    expect(segments.filter((segment) => segment.highlighted)).toHaveLength(2);
  });

  test('merges overlapping matches', () => {
    const segments = buildExtractionTextSegments('North America', {
      values: [{ value: 'North America' }, { value: 'America' }],
    });

    expect(segments).toEqual([
      { start: 0, end: 13, text: 'North America', highlighted: true },
    ]);
  });

  test('returns a single plain segment when nothing matches', () => {
    expect(buildExtractionTextSegments('Revenue grew by 48%.', {
      values: [{ value: '49%' }],
    })).toEqual([
      { start: 0, end: 20, text: 'Revenue grew by 48%.', highlighted: false },
    ]);
  });
});
