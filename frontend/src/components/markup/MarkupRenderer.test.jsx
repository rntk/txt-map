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
            position_indices: [1, 2, 3],
            data: {
              paragraphs: [
                { position_indices: [1, 2] },
                { position_indices: [3] },
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

  it('synthesizes plain segments around non-plain markup', () => {
    render(
      <MarkupRenderer
        segments={[
          {
            type: 'quote',
            position_indices: [2],
            data: {
              attribution: 'Ada',
              position_indices: [2],
            },
          },
        ]}
        sentences={[
          'Intro sentence.',
          '"Programs must be written for people to read."',
          'Closing sentence.',
        ]}
      />
    );

    expect(document.querySelectorAll('.markup-plain__sentence')).toHaveLength(2);
    expect(screen.getByText('Intro sentence.')).toBeInTheDocument();
    expect(screen.getByText('Closing sentence.')).toBeInTheDocument();
  });

  it('renders position-based title and body from markup-local units', () => {
    render(
      <MarkupRenderer
        segments={[
          {
            type: 'title',
            position_indices: [1, 2],
            data: {
              level: 2,
              title_position_index: 1,
            },
          },
        ]}
        sentences={[
          'How we turned LLMs to computers',
          'We turn arbitrary C code into tokens the model can execute.',
        ]}
      />
    );

    expect(screen.getByText('How we turned LLMs to computers')).toBeInTheDocument();
    expect(screen.getByText('We turn arbitrary C code into tokens the model can execute.')).toBeInTheDocument();
  });
});
