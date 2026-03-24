import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkupRenderer from './MarkupRenderer';

describe('MarkupRenderer paragraph support', () => {
  it('renders paragraph markup as separate prose blocks', () => {
    render(
      <MarkupRenderer
        segments={[
          {
            type: 'paragraph',
            sentence_indices: [1, 2, 3],
            data: {
              paragraphs: [
                { sentence_indices: [1, 2] },
                { sentence_indices: [3] },
              ],
            },
          },
        ]}
        sentences={[
          'First sentence.',
          'Second sentence.',
          'Third sentence.',
        ]}
      />
    );

    const paragraphs = document.querySelectorAll('.markup-paragraph__block');

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent('First sentence. Second sentence.');
    expect(paragraphs[1]).toHaveTextContent('Third sentence.');
    expect(screen.queryByText('1.')).not.toBeInTheDocument();
  });

  it('keeps plain markup rendering unchanged', () => {
    render(
      <MarkupRenderer
        segments={[
          {
            type: 'plain',
            sentence_indices: [1, 2],
            data: {},
          },
        ]}
        sentences={[
          'First sentence.',
          'Second sentence.',
        ]}
      />
    );

    expect(document.querySelectorAll('.markup-plain__sentence')).toHaveLength(2);
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
  });
});
