import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WordTree, {
  buildWordTreeEntries,
  buildWordTreeMatchRegex,
  sentenceToPlainText,
  tokenizeWordTreeText,
} from './WordTree';

describe('WordTree helpers', () => {
  it('strips HTML before matching tree text', () => {
    expect(sentenceToPlainText('<p>Hello <strong>beta</strong></p>')).toBe('Hello beta');
  });

  it('preserves original token casing while normalizing keys', () => {
    expect(tokenizeWordTreeText('Alpha beta')).toEqual([
      { text: 'Alpha', normalized: 'alpha' },
      { text: 'beta', normalized: 'beta' },
    ]);
  });

  it('builds a literal phrase regex that ignores regex metacharacters', () => {
    const regex = buildWordTreeMatchRegex('beta?');

    expect('beta?'.match(regex)).toBeTruthy();
    expect('betax'.match(regex)).toBeFalsy();
  });

  it('creates one entry per occurrence and marks read sentences', () => {
    const entries = buildWordTreeEntries(
      ['Alpha beta beta gamma.', '<p>Beta? and beta?</p>'],
      'beta',
      new Set([2])
    );

    expect(entries).toHaveLength(4);
    expect(entries.filter((entry) => entry.sentenceNumber === 1)).toHaveLength(2);
    expect(entries.filter((entry) => entry.sentenceNumber === 2).every((entry) => entry.isRead)).toBe(true);
  });

  it('supports multi-word phrases', () => {
    const entries = buildWordTreeEntries(
      ['We really love the new design.', 'They love the old version too.'],
      'love the'
    );

    expect(entries).toHaveLength(2);
    expect(entries[0].matchText.toLowerCase()).toBe('love the');
  });
});

describe('WordTree component', () => {
  it('renders rows and dims read entries', () => {
    const entries = [
      {
        id: '1',
        sentenceIndex: 0,
        sentenceNumber: 1,
        sentenceText: 'Alpha beta gamma',
        matchText: 'beta',
        leftTokens: [{ text: 'Alpha', normalized: 'alpha' }],
        rightTokens: [{ text: 'gamma', normalized: 'gamma' }],
        isRead: false,
      },
      {
        id: '2',
        sentenceIndex: 1,
        sentenceNumber: 2,
        sentenceText: 'Delta beta epsilon',
        matchText: 'beta',
        leftTokens: [{ text: 'Delta', normalized: 'delta' }],
        rightTokens: [{ text: 'epsilon', normalized: 'epsilon' }],
        isRead: true,
      },
    ];

    render(<WordTree entries={entries} pivotLabel="beta" />);

    expect(screen.getAllByText('beta')).toHaveLength(2);
    expect(screen.getByText('Sentence 2').closest('.word-tree__row')).toHaveClass('word-tree__row--read');
  });

  it('shows the empty state when there are no entries', () => {
    render(<WordTree entries={[]} pivotLabel="beta" />);

    expect(screen.getByText('No occurrences of this word were found in the article.')).toBeInTheDocument();
  });
});
