import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TextPage from './TextPage';

vi.mock('./TopicsRiverChart', () => ({ default: () => <div data-testid="topics-river-chart" /> }));
vi.mock('./SubtopicsRiverChart', () => ({ default: () => <div data-testid="subtopics-river-chart" /> }));
vi.mock('./MarimekkoChartTab', () => ({ default: () => <div data-testid="marimekko-chart-tab" /> }));
vi.mock('./MindmapResults', () => ({ default: () => <div data-testid="mindmap-results" /> }));
vi.mock('./PrefixTreeResults', () => ({ default: () => <div data-testid="prefix-tree-results" /> }));
vi.mock('./FullScreenGraph', () => ({ default: ({ children }) => <div data-testid="fullscreen-graph">{children}</div> }));
vi.mock('./TopicsTagCloud', () => ({ default: () => <div data-testid="topics-tag-cloud" /> }));
vi.mock('./CircularPackingChart', () => ({ default: () => <div data-testid="circular-packing-chart" /> }));
vi.mock('./GridView', () => ({ default: () => <div data-testid="grid-view" /> }));
vi.mock('./TopicsBarChart', () => ({ default: () => <div data-testid="topics-bar-chart" /> }));
vi.mock('./RadarChart', () => ({ default: () => <div data-testid="radar-chart" /> }));
vi.mock('./ArticleStructureChart', () => ({ default: () => <div data-testid="article-structure-chart" /> }));
vi.mock('../utils/summaryTimeline', () => ({
  buildSummaryTimelineItems: () => [],
}));

describe('TextPage raw text navigation', () => {
  const mockSubmission = {
    source_url: 'http://example.com',
    text_content: 'Alpha Beta Gamma',
    html_content: '',
    status: {
      overall: 'completed',
      tasks: {},
    },
    results: {
      sentences: ['Alpha Beta Gamma'],
      topics: [
        {
          name: 'Topic1',
          sentences: [1],
          ranges: [{ start: 6, end: 10, sentence_start: 1, sentence_end: 1 }],
        },
      ],
      topic_summaries: {},
      paragraph_map: null,
      summary: [],
      summary_mappings: [],
    },
  };

  const originalFetch = global.fetch;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    window.history.pushState({}, '', '/submission/view/test-submission-id');

    if (typeof navigator.sendBeacon === 'undefined') {
      navigator.sendBeacon = vi.fn();
    }

    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/submission/test-submission-id/status')) {
        return {
          ok: true,
          json: async () => ({ overall_status: 'completed', tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => mockSubmission,
      };
    });

    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('renders highlighted raw text and focuses a raw-text anchor from the topic list', async () => {
    render(<TextPage />);

    await screen.findByText('Source:');

    fireEvent.click(screen.getByRole('button', { name: 'Raw Text' }));

    // Need to select the topic to make its range highlighted
    // Use getAllByRole since there may be multiple checkboxes (e.g. "Grouped by topics" toggle)
    const topicCheckbox = screen.getAllByRole('checkbox').find(
      el => el.closest('li') !== null
    );
    fireEvent.click(topicCheckbox);

    await waitFor(() => {
      expect(document.querySelector('.raw-text-token')).toBeInTheDocument();
    });

    const betaToken = screen.getByText('Beta');
    expect(betaToken).toBeInTheDocument();
    expect(betaToken).toHaveClass('raw-text-token');
    expect(betaToken).toHaveClass('highlighted');

    fireEvent.click(screen.getByText('Topic1'));

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('applies faded styling in raw text for read topics that are not selected', async () => {
    render(<TextPage />);

    await screen.findByText('Source:');

    fireEvent.click(screen.getByRole('button', { name: 'Raw Text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Read' }));

    await waitFor(() => {
      expect(document.querySelector('.raw-text-token')).toBeInTheDocument();
    });

    const betaToken = await screen.findByText('Beta');
    expect(betaToken).toHaveClass('raw-text-token');
    expect(betaToken).toHaveClass('faded');
    expect(betaToken).not.toHaveClass('highlighted');
  });
});
