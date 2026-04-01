import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TextPage from './TextPage';
import { matchSummaryToTopics } from '../utils/summaryMatcher';

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

vi.mock('../utils/summaryMatcher', () => ({
  matchSummaryToTopics: vi.fn(() => []),
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
      markup: {
        Topic1: {
          positions: [
            {
              index: 1,
              text: 'Alpha Beta Gamma',
              source_sentence_index: 1,
            },
          ],
          segments: [
            {
              type: 'quote',
              position_indices: [1],
              data: {
                attribution: 'Test',
                position_indices: [1],
              },
            },
          ],
        },
      },
      topic_summaries: {},
      article_summary: {
        text: 'Brief article summary',
        bullets: ['Important detail one', 'Important detail two'],
      },
      paragraph_map: null,
      summary: [],
      summary_mappings: [],
      insights: [
        {
          name: 'Important connection',
          topics: ['Topic1'],
          source_sentence_indices: [1],
          ranges: [{ start: 0, end: 0 }],
        },
      ],
    },
  };

  const originalFetch = global.fetch;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    window.history.pushState({}, '', '/page/text/test-submission-id');

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

  it('renders the article summary tab with summary text and bullets', async () => {
    render(<TextPage />);

    await screen.findByText('Source:');

    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));

    expect(screen.getByText('Brief article summary')).toBeInTheDocument();
    expect(screen.getByText(/Important detail one/)).toBeInTheDocument();
    expect(screen.getByText(/Important detail two/)).toBeInTheDocument();
    expect(screen.queryByText('Grouped by topics')).not.toBeInTheDocument();
    expect(screen.queryByText('Show tooltips')).not.toBeInTheDocument();
  });

  it('shows no [source] links when matchSummaryToTopics returns no matches', async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([]);

    render(<TextPage />);
    await screen.findByText('Source:');
    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));

    expect(screen.queryAllByText('[source]')).toHaveLength(0);
  });

  it('shows [source] links on bullets when matches exist', async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([
      { topic: { name: 'Topic1', sentences: [1] }, score: 0.8, sentenceIndices: [1] },
    ]);

    render(<TextPage />);
    await screen.findByText('Source:');
    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));

    const sourceLinks = screen.getAllByText('[source]');
    // Two bullets + summary text all get [source] links
    expect(sourceLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('highlights summary bullets with a semantic class when the topic is selected', async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([
      { topic: { name: 'Topic1', sentences: [1] }, score: 0.8, sentenceIndices: [1] },
    ]);

    render(<TextPage />);
    await screen.findByText('Source:');

    const topicCheckbox = screen.getAllByRole('checkbox').find(
      el => el.closest('li') !== null
    );
    fireEvent.click(topicCheckbox);

    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));

    const highlightedBullet = screen.getByText('Important detail one').closest('li');
    expect(highlightedBullet).toHaveClass('reading-summary__bullet--highlighted');
  });

  it('opens topic menu when [source] is clicked on a bullet', async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([
      { topic: { name: 'Topic1', sentences: [1] }, score: 0.8, sentenceIndices: [1] },
    ]);

    render(<TextPage />);
    await screen.findByText('Source:');
    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));

    const sourceLinks = screen.getAllByText('[source]');
    fireEvent.click(sourceLinks[0]);

    expect(screen.getByText('Select topic:')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Topic1/ })).toBeInTheDocument();
  });

  it('opens TopicSentencesModal when a topic is selected from the menu', async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([
      { topic: { name: 'Topic1', sentences: [1] }, score: 0.8, sentenceIndices: [1] },
    ]);

    render(<TextPage />);
    await screen.findByText('Source:');
    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));

    const sourceLinks = screen.getAllByText('[source]');
    fireEvent.click(sourceLinks[0]);

    fireEvent.click(screen.getByRole('menuitem', { name: /Topic1/ }));

    // Menu should close and modal should open
    expect(screen.queryByText('Select topic:')).not.toBeInTheDocument();
    expect(document.querySelector('.topic-sentences-modal__header h3')).toHaveTextContent('Topic1');
    expect(screen.getByRole('button', { name: 'Enriched' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enriched' })).toHaveClass('topic-sentences-modal__tab--active');
  });

  it('renders the read progress gauge', async () => {
    render(<TextPage />);
    await screen.findByText('Source:');
    
    // Initial progress should be 0%
    expect(screen.getByText('0%')).toBeInTheDocument();

    // Mark Topic1 as read
    fireEvent.click(screen.getByRole('button', { name: 'Mark Read' }));
    
    // Topic1 has [1] sentence, total 1 sentence. So 100%.
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  it('renders the fullscreen insights view with titles and source sentences', async () => {
    render(<TextPage />);

    await screen.findByText('Source:');

    fireEvent.click(screen.getByRole('button', { name: 'Insights' }));

    expect(screen.getByText('Important connection')).toBeInTheDocument();
    expect(screen.getAllByText('Alpha Beta Gamma').length).toBeGreaterThan(0);
  });

  it('renders the Markup tab in article order without duplicating the original source sentence', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/submission/test-submission-id/status')) {
        return {
          ok: true,
          json: async () => ({ overall_status: 'completed', tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          html_content: '<p>Intro.</p><p><strong>Beta one.</strong> Beta two.</p><p>Outro.</p>',
          results: {
            ...mockSubmission.results,
            sentences: ['Intro.', 'Beta one. Beta two.', 'Outro.'],
            topics: [
              {
                name: 'Topic1',
                sentences: [2],
                ranges: [{ start: 0, end: 0, sentence_start: 2, sentence_end: 2 }],
              },
            ],
            markup: {
              Topic1: {
                positions: [
                  {
                    index: 1,
                    text: 'Beta one.',
                    source_sentence_index: 2,
                  },
                  {
                    index: 2,
                    text: 'Beta two.',
                    source_sentence_index: 2,
                  },
                ],
                segments: [
                  {
                    type: 'quote',
                    position_indices: [1],
                    data: {
                      attribution: 'Ada',
                      position_indices: [1],
                    },
                  },
                ],
              },
            },
          },
        }),
      };
    });

    const { container } = render(<TextPage />);

    await screen.findByText('Source:');
    fireEvent.click(screen.getByRole('button', { name: 'Markup' }));

    expect(screen.getByText('Intro.')).toBeInTheDocument();
    expect(screen.getByText('Beta one.')).toBeInTheDocument();
    expect(screen.getByText('Beta two.')).toBeInTheDocument();
    expect(screen.getByText('Outro.')).toBeInTheDocument();
    expect(screen.queryByText('Beta one. Beta two.')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.markup-quote')).toHaveLength(1);
  });

  it('keeps the Markup tab visible even when grouped-by-topics was enabled earlier', async () => {
    const { container } = render(<TextPage />);

    await screen.findByText('Source:');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Grouped by topics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Markup' }));

    expect(screen.queryByLabelText('Grouped by topics')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Show tooltips')).toBeInTheDocument();
    expect(container.querySelector('.markup-quote')).toBeInTheDocument();
  });

  it('shows a topic tooltip when markup text is clicked', async () => {
    render(<TextPage />);

    await screen.findByText('Source:');
    fireEvent.click(screen.getByRole('button', { name: 'Markup' }));
    fireEvent.click(screen.getByText('Alpha Beta Gamma'));

    const tooltip = await waitFor(() => document.querySelector('.text-topic-tooltip'));
    expect(tooltip).toBeInTheDocument();
    expect(within(tooltip).getByText('Topic1')).toBeInTheDocument();
    expect(within(tooltip).getByRole('button', { name: 'Mark Read' })).toBeInTheDocument();
    expect(within(tooltip).getByRole('button', { name: 'View sentences' })).toBeInTheDocument();
  });
});
