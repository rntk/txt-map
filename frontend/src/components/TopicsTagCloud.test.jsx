import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TopicsTagCloud from './TopicsTagCloud';

describe('TopicsTagCloud', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          words: [{ word: 'theta', frequency: 2 }],
          sentence_count: 1,
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the shared breadcrumb chrome and clickable cloud words', async () => {
    render(
      <TopicsTagCloud
        submissionId="submission-1"
        topics={[{ name: 'Alpha>Beta', sentences: [1, 2] }]}
        sentences={['First sentence', 'Second sentence']}
      />
    );

    expect(screen.getByRole('button', { name: 'All Topics' })).toHaveClass('topics-tag-cloud__breadcrumb--current');

    const topicWord = await screen.findByText('Alpha');
    expect(topicWord).toHaveClass('topics-tag-cloud__word--clickable');
    expect(topicWord).toHaveClass('topics-tag-cloud__word--text');

    const sentenceWord = await screen.findByText('theta');
    expect(sentenceWord).toHaveClass('topics-tag-cloud__word--clickable');
    expect(sentenceWord.style.getPropertyValue('--word-font-size')).not.toBe('');
  });
});
