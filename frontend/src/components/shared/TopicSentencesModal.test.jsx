import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TopicSentencesModal from './TopicSentencesModal';

describe('TopicSentencesModal markup resolution', () => {
  let scrollIntoViewMock;
  let requestAnimationFrameMock;
  let cancelAnimationFrameMock;

  beforeEach(() => {
    scrollIntoViewMock = vi.fn();
    requestAnimationFrameMock = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    cancelAnimationFrameMock = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  afterEach(() => {
    requestAnimationFrameMock.mockRestore();
    cancelAnimationFrameMock.mockRestore();
  });

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
                type: 'quote',
                position_indices: [1],
                data: {
                  attribution: 'Planck',
                  position_indices: [1],
                },
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Physics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enriched' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enriched' })).toHaveClass('topic-sentences-modal__tab--active');
    expect(screen.getByLabelText('Topic article minimap')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Scroll to sentence 1' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content, element) => element?.closest('.markup-quote__text')?.textContent?.includes('Quantum mechanics changed physics.')).length).toBeGreaterThan(0);
  });

  it('keeps enriched disabled when markup only contains plain segments', () => {
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

    expect(screen.getByRole('button', { name: 'Enriched' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sentences' })).toHaveClass('topic-sentences-modal__tab--active');
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

  it('renders separate enriched range panels for non-adjacent source sentence groups', () => {
    render(
      <TopicSentencesModal
        topic={{
          displayName: 'Physics',
          fullPath: 'Science>Physics',
          sentenceIndices: [1, 2, 10, 11],
        }}
        sentences={[
          'Quantum mechanics changed physics.',
          'Researchers debated the implications.',
          'Context gap one.',
          'Context gap two.',
          'Context gap three.',
          'Context gap four.',
          'Context gap five.',
          'Context gap six.',
          'Context gap seven.',
          'A later discovery shifted the field.',
          'The community adopted the new model.',
        ]}
        onClose={vi.fn()}
        markup={{
          'Science>Physics': {
            positions: [
              {
                index: 1,
                text: 'Quantum mechanics changed physics.',
                source_sentence_index: 1,
              },
              {
                index: 2,
                text: 'Researchers debated the implications.',
                source_sentence_index: 2,
              },
              {
                index: 3,
                text: 'A later discovery shifted the field.',
                source_sentence_index: 10,
              },
              {
                index: 4,
                text: 'The community adopted the new model.',
                source_sentence_index: 11,
              },
            ],
            segments: [
              {
                type: 'quote',
                position_indices: [1, 2],
                data: {
                  attribution: 'Planck',
                  position_indices: [1, 2],
                },
              },
              {
                type: 'quote',
                position_indices: [3, 4],
                data: {
                  attribution: 'Bohr',
                  position_indices: [3, 4],
                },
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByText('Range 1')).toBeInTheDocument();
    expect(screen.getByText('Sentences 1-2')).toBeInTheDocument();
    expect(screen.getByText('Range 2')).toBeInTheDocument();
    expect(screen.getByText('Sentences 10-11')).toBeInTheDocument();
    expect(screen.getAllByText((content, element) => element?.closest('.markup-quote__text')?.textContent?.includes('Quantum mechanics changed physics. Researchers debated the implications.')).length).toBeGreaterThan(0);
    expect(screen.getByText('A later discovery shifted the field. The community adopted the new model.')).toBeInTheDocument();
  });

  it('falls back to topic sentence indices when markup positions do not include source sentence indices', () => {
    render(
      <TopicSentencesModal
        topic={{
          displayName: 'Physics',
          fullPath: 'Science>Physics',
          sentenceIndices: [1, 2, 10, 11],
          ranges: [
            { sentence_start: 1, sentence_end: 2 },
            { sentence_start: 10, sentence_end: 11 },
          ],
        }}
        sentences={[
          'Quantum mechanics changed physics.',
          'Researchers debated the implications.',
          'Context gap one.',
          'Context gap two.',
          'Context gap three.',
          'Context gap four.',
          'Context gap five.',
          'Context gap six.',
          'Context gap seven.',
          'A later discovery shifted the field.',
          'The community adopted the new model.',
        ]}
        onClose={vi.fn()}
        markup={{
          'Science>Physics': {
            positions: [
              { index: 1, text: 'Quantum mechanics changed physics.' },
              { index: 2, text: 'Researchers debated the implications.' },
              { index: 3, text: 'A later discovery shifted the field.' },
              { index: 4, text: 'The community adopted the new model.' },
            ],
            segments: [
              {
                type: 'quote',
                position_indices: [1, 2],
                data: {
                  attribution: 'Planck',
                  position_indices: [1, 2],
                },
              },
              {
                type: 'quote',
                position_indices: [3, 4],
                data: {
                  attribution: 'Bohr',
                  position_indices: [3, 4],
                },
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByText('Range 1')).toBeInTheDocument();
    expect(screen.getByText('Sentences 1-2')).toBeInTheDocument();
    expect(screen.getByText('Range 2')).toBeInTheDocument();
    expect(screen.getByText('Sentences 10-11')).toBeInTheDocument();
  });

  it('renders atomic data_trend markup only once and falls back to plain content in later ranges', () => {
    const { container } = render(
      <TopicSentencesModal
        topic={{
          displayName: 'Physics',
          fullPath: 'Science>Physics',
          sentenceIndices: [1, 10],
        }}
        sentences={[
          'Early reading.',
          'Context gap one.',
          'Context gap two.',
          'Context gap three.',
          'Context gap four.',
          'Context gap five.',
          'Context gap six.',
          'Context gap seven.',
          'Context gap eight.',
          'Late reading.',
        ]}
        onClose={vi.fn()}
        markup={{
          'Science>Physics': {
            positions: [
              {
                index: 1,
                text: 'Early reading.',
                source_sentence_index: 1,
              },
              {
                index: 2,
                text: 'Late reading.',
                source_sentence_index: 10,
              },
            ],
            segments: [
              {
                type: 'data_trend',
                position_indices: [1, 2],
                data: {
                  values: [
                    { label: 'Before', value: 10 },
                    { label: 'After', value: 20 },
                  ],
                  unit: '%',
                },
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByText('Range 1')).toBeInTheDocument();
    expect(screen.getByText('Sentence 1')).toBeInTheDocument();
    expect(screen.getByText('Range 2')).toBeInTheDocument();
    expect(screen.getByText('Sentence 10')).toBeInTheDocument();
    expect(container.querySelectorAll('.markup-data-trend__chart-wrapper')).toHaveLength(1);
    expect(screen.getByText('Late reading.')).toBeInTheDocument();
  });

  it('scrolls to an already rendered sentence when the modal minimap is clicked', async () => {
    const { container } = render(
      <TopicSentencesModal
        topic={{
          displayName: 'Physics',
          fullPath: 'Science>Physics',
          sentenceIndices: [1, 2],
        }}
        sentences={[
          'Quantum mechanics changed physics.',
          'Researchers debated the implications.',
          'A later discovery shifted the field.',
        ]}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sentences' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Scroll to sentence 1' })[0]);

    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(
      screen.getAllByText((content, element) => element?.textContent?.includes('Quantum mechanics changed physics.') ?? false).length
    ).toBeGreaterThan(0);
    expect(container.querySelector('.grid-view-minimap-bar--active')).toBeInTheDocument();
  });

  it('auto-scrolls the minimap to the first topic sentence when the modal opens', async () => {
    render(
      <TopicSentencesModal
        topic={{
          displayName: 'Physics',
          fullPath: 'Science>Physics',
          sentenceIndices: [10],
        }}
        sentences={[
          'Sentence 1',
          'Sentence 2',
          'Sentence 3',
          'Sentence 4',
          'Sentence 5',
          'Sentence 6',
          'Sentence 7',
          'Sentence 8',
          'Sentence 9',
          'Sentence 10',
          'Sentence 11',
          'Sentence 12',
        ]}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it('switches to sentences and reveals context when a minimap click targets a hidden sentence', async () => {
    render(
      <TopicSentencesModal
        topic={{
          displayName: 'Physics',
          fullPath: 'Science>Physics',
          sentenceIndices: [10],
        }}
        sentences={[
          'Sentence 1',
          'Sentence 2',
          'Sentence 3',
          'Sentence 4',
          'Sentence 5',
          'Sentence 6',
          'Sentence 7',
          'Sentence 8',
          'Sentence 9',
          'Sentence 10',
          'Sentence 11',
          'Sentence 12',
        ]}
        onClose={vi.fn()}
        markup={{
          'Science>Physics': {
            positions: [
              {
                index: 1,
                text: 'Sentence 10',
                source_sentence_index: 10,
              },
            ],
            segments: [
              {
                type: 'quote',
                position_indices: [1],
                data: {
                  attribution: 'Planck',
                  position_indices: [1],
                },
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByRole('button', { name: 'Enriched' })).toHaveClass('topic-sentences-modal__tab--active');

    fireEvent.click(screen.getAllByRole('button', { name: 'Scroll to sentence 7' })[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sentences' })).toHaveClass('topic-sentences-modal__tab--active');
    });
    expect(screen.getByText('7.')).toBeInTheDocument();
    expect(screen.getByText('Sentence 7')).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });
});
