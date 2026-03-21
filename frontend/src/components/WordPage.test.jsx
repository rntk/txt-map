import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WordPage from './WordPage';

const mockUseSubmission = vi.fn();

vi.mock('../hooks/useSubmission', () => ({
  useSubmission: (...args) => mockUseSubmission(...args),
}));

vi.mock('./TextDisplay', () => ({
  default: ({ sentences }) => <div data-testid="text-display">{sentences.join(' ')}</div>,
}));

vi.mock('./CircularPackingChart', () => ({
  default: () => <div data-testid="circular-packing-chart">Circles panel</div>,
}));

vi.mock('./TopicsTagCloud', () => ({
  default: () => <div data-testid="topics-tag-cloud">Tags Cloud panel</div>,
}));

vi.mock('./SummaryTimeline', () => ({
  default: () => <div data-testid="summary-timeline">Summaries panel</div>,
}));

vi.mock('./shared/TopicSentencesModal', () => ({
  default: () => <div data-testid="topic-sentences-modal" />,
}));

vi.mock('../utils/summaryTimeline', () => ({
  buildSummaryTimelineItems: () => [],
}));

describe('WordPage header layout', () => {
  beforeEach(() => {
    mockUseSubmission.mockReturnValue({
      submission: {
        status: {
          overall: 'completed',
          tasks: {
            summarization: { status: 'completed' },
          },
        },
        results: {
          sentences: ['Alpha beta gamma', 'Another beta sentence'],
          topics: [
            {
              name: 'Topic 1',
              sentences: [1],
            },
          ],
          topic_summaries: {
            'Topic 1': 'Summary text',
          },
          summary: [],
          summary_mappings: [],
        },
      },
      loading: false,
      error: null,
      readTopics: new Set(),
      toggleRead: vi.fn(),
    });

    window.history.pushState({}, '', '/page/word/sub-123/beta');
  });

  it('renders the tabs in the Back to Article header row and removes status refresh controls', () => {
    render(<WordPage />);

    expect(screen.getByRole('button', { name: /Back to Article/i })).toBeInTheDocument();
    expect(screen.getByText('Word Analysis:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sentences' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Topics (Circles)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Summaries' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tags Cloud' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refresh/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/summarization/i)).not.toBeInTheDocument();
  });

  it('switches visible content when a different tab is selected', () => {
    render(<WordPage />);

    expect(screen.getByText(/Sentences matching "beta" \(2\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Topics (Circles)' }));
    expect(screen.getByTestId('circular-packing-chart')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Summaries' }));
    expect(screen.getByTestId('summary-timeline')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tags Cloud' }));
    expect(screen.getByTestId('topics-tag-cloud')).toBeInTheDocument();
  });
});
