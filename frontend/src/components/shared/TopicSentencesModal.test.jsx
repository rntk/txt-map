import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TopicSentencesModal from './TopicSentencesModal';

describe('TopicSentencesModal markup resolution', () => {
  it('resolves markup by fullPath when the topic only has a shortened displayName', () => {
    render(
      <TopicSentencesModal
        topic={{
          displayName: 'Physics',
          fullPath: 'Science>Physics',
          sentenceIndices: [1],
        }}
        sentences={['Quantum mechanics changed physics.']}
        onClose={vi.fn()}
        markup={{
          'Science>Physics': {
            positions: [
              {
                index: 1,
                text: 'Quantum mechanics changed physics.',
                source_sentence_index: 1,
              },
            ],
            segments: [
              {
                type: 'plain',
                position_indices: [1],
                data: {},
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Physics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enriched' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enriched' })).toHaveClass('topic-sentences-modal__tab--active');
    expect(screen.getByText('Quantum mechanics changed physics.')).toBeInTheDocument();
  });

  it('normalizes the topic name before toggling read state', () => {
    const onToggleRead = vi.fn();

    render(
      <TopicSentencesModal
        topic={{
          displayName: 'Physics',
          fullPath: 'Science>Physics',
          sentenceIndices: [1],
        }}
        sentences={['Quantum mechanics changed physics.']}
        onClose={vi.fn()}
        onToggleRead={onToggleRead}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));

    expect(onToggleRead).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Science>Physics',
      fullPath: 'Science>Physics',
      displayName: 'Physics',
      sentenceIndices: [1],
    }));
  });
});
