import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import OverviewPage from './OverviewPage';

const mockSubmission = {
  submission_id: 'test-id-123',
  source_url: 'https://example.com/article',
  created_at: '2026-03-18T10:00:00Z',
  updated_at: '2026-03-19T10:00:00Z',
  text_content: 'Sample text content.',
  read_topics: [],
  status: { overall: 'completed', tasks: {} },
  results: {
    sentences: ['Sentence one.', 'Sentence two.', 'Sentence three.'],
    topics: [
      { name: 'Topic A', sentences: [1, 2] },
      { name: 'Topic B', sentences: [3] },
    ],
    article_summary: {
      text: 'This is the article summary text.',
      bullets: ['Key point one', 'Key point two'],
    },
    topic_mindmaps: {},
    subtopics: [],
    summary: [],
    summary_mappings: [],
    topic_summaries: {},
  },
};

describe('OverviewPage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/page/overview/test-id-123' },
      writable: true,
    });

    global.fetch = vi.fn(async (url) => {
      if (url.includes('/word-cloud') || url.includes('/tags')) {
        return { ok: true, json: async () => ({ words: [], sentence_count: 0 }) };
      }
      if (url.includes('/read-progress')) {
        return { ok: true, json: async () => ({ read_count: 0, total_count: 3 }) };
      }
      return { ok: true, json: async () => mockSubmission };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders loading state initially', () => {
    render(<OverviewPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders Article Overview slide by default', async () => {
    render(<OverviewPage />);
    await screen.findByText('This is the article summary text.');
    expect(screen.getAllByText('Article Overview').length).toBeGreaterThan(0);
    expect(screen.getByText('3')).toBeInTheDocument(); // sentence count
    expect(screen.getByText('2')).toBeInTheDocument(); // topic count
  });

  it('shows progress indicator "1 of 5" on first slide', async () => {
    render(<OverviewPage />);
    await screen.findByText('This is the article summary text.');
    expect(screen.getByText('1 of 5')).toBeInTheDocument();
  });

  it('navigates to next slide on Next click', async () => {
    render(<OverviewPage />);
    await screen.findByText('This is the article summary text.');

    const nextBtn = screen.getByText('Next');
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Topic Landscape').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
  });

  it('Back button is disabled on first slide', async () => {
    render(<OverviewPage />);
    await screen.findByText('This is the article summary text.');
    expect(screen.getByText('Back')).toBeDisabled();
  });

  it('navigates via TOC click', async () => {
    render(<OverviewPage />);
    await screen.findByText('This is the article summary text.');

    fireEvent.click(screen.getByText('Mindmap'));
    await waitFor(() => {
      expect(screen.getByText('4 of 5')).toBeInTheDocument();
    });
  });

  it('Next button is disabled on last slide', async () => {
    render(<OverviewPage />);
    await screen.findByText('This is the article summary text.');

    const tocItems = screen.getAllByText('Tags Cloud');
    fireEvent.click(tocItems[0]);

    await waitFor(() => {
      expect(screen.getByText('5 of 5')).toBeInTheDocument();
    });
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('exit link has correct href', async () => {
    render(<OverviewPage />);
    await screen.findByText('This is the article summary text.');

    const exitLink = screen.getByText('Open Full View');
    expect(exitLink.getAttribute('href')).toBe('/page/text/test-id-123');
  });

  it('handles empty results gracefully', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/read-progress')) {
        return { ok: true, json: async () => ({ read_count: 0, total_count: 0 }) };
      }
      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          results: {},
        }),
      };
    });

    render(<OverviewPage />);
    await screen.findAllByText('Article Overview');
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThan(0); // 0 sentences and/or topics
  });

  describe('storytelling layout', () => {
    const mockStorytellingSubmission = {
      ...mockSubmission,
      tasks: {
        storytelling_generation: { status: 'completed' },
      },
      results: {
        ...mockSubmission.results,
        storytelling: {
          title: 'The Story of This Article',
          sections: [
            { type: 'narrative', text: 'An insightful opening paragraph.', style: 'intro' },
            { type: 'stats', items: [{ label: 'Sentences', value: '3' }, { label: 'Topics', value: '2' }] },
            { type: 'key_findings', findings: ['Finding one about the article', 'Finding two that is notable'] },
            { type: 'highlight', topic: 'Topic A', text: 'Topic A is very prominent', insight: 'This reveals something interesting' },
            { type: 'narrative', text: 'A closing thought.', style: 'conclusion' },
          ],
        },
      },
    };

    beforeEach(() => {
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/word-cloud') || url.includes('/tags')) {
          return { ok: true, json: async () => ({ words: [], sentence_count: 0 }) };
        }
        if (url.includes('/read-progress')) {
          return { ok: true, json: async () => ({ read_count: 0, total_count: 3 }) };
        }
        return { ok: true, json: async () => mockStorytellingSubmission };
      });
    });

    it('renders storytelling title when storytelling data is present', async () => {
      render(<OverviewPage />);
      await screen.findByText('The Story of This Article');
    });

    it('renders narrative intro text', async () => {
      render(<OverviewPage />);
      await screen.findByText('An insightful opening paragraph.');
    });

    it('renders key findings', async () => {
      render(<OverviewPage />);
      await screen.findByText('Finding one about the article');
      await screen.findByText('Finding two that is notable');
    });

    it('renders highlight section', async () => {
      render(<OverviewPage />);
      await screen.findByText('Topic A is very prominent');
      await screen.findByText('This reveals something interesting');
    });

    it('renders TOC with chart and named section entries', async () => {
      render(<OverviewPage />);
      await screen.findByText('The Story of This Article');
      // TOC entries for named sections (may appear in both TOC and section heading)
      expect(screen.getAllByText('Introduction').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Key Findings').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Conclusion').length).toBeGreaterThan(0);
    });

    it('shows Open Full View link', async () => {
      render(<OverviewPage />);
      await screen.findByText('The Story of This Article');
      const link = screen.getByText('Open Full View');
      expect(link.getAttribute('href')).toBe('/page/text/test-id-123');
    });

    it('shows Regenerate Story button', async () => {
      render(<OverviewPage />);
      await screen.findByText('The Story of This Article');
      expect(screen.getByText('Regenerate Story')).toBeInTheDocument();
    });

    it('does not render unknown section types', async () => {
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/read-progress')) {
          return { ok: true, json: async () => ({ read_count: 0, total_count: 0 }) };
        }
        return {
          ok: true,
          json: async () => ({
            ...mockStorytellingSubmission,
            results: {
              ...mockStorytellingSubmission.results,
              storytelling: {
                title: 'Test',
                sections: [
                  { type: 'unknown_type', data: 'should be ignored' },
                  { type: 'narrative', text: 'Valid narrative.', style: 'body' },
                ],
              },
            },
          }),
        };
      });

      render(<OverviewPage />);
      await screen.findByText('Valid narrative.');
      // unknown type renders nothing — no crash
    });
  });

  describe('annotation layout extraction highlighting', () => {
    const annotationSubmission = {
      ...mockSubmission,
      results: {
        ...mockSubmission.results,
        topics: [{ name: 'Topic A', sentences: [1, 2] }],
        sentences: [
          'Opening context sentence.',
          'Revenue grew by 48% in Europe.',
        ],
        annotations: {
          sentence_annotations: {
            1: { importance: 'high', flags: ['definition'] },
            2: { importance: 'normal', flags: ['data_point'] },
          },
          topic_annotations: {
            'Topic A': {
              reading_priority: 'optional',
              recommended_sentences: [1],
            },
          },
          data_extractions: [
            {
              label: 'Revenue growth',
              source_sentences: [2],
              values: [{ key: 'Europe', value: '48%' }],
              display_suggestion: 'table',
            },
          ],
          structural_suggestions: {
            reading_order: ['Topic A'],
            recommended_charts: [],
          },
        },
      },
    };

    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn();
      global.fetch = vi.fn(async () => ({ ok: true, json: async () => annotationSubmission }));
    });

    it('shows a hidden-sentence hint on hover without revealing the sentence', async () => {
      render(<OverviewPage />);
      await screen.findByText('Topic A');

      const topicCard = screen.getByText('Topic A').closest('.rg-topic-card');
      fireEvent.click(within(topicCard).getByRole('button', { name: 'Expand' }));
      // Badge now shows extraction type ('Data' since no type field); hint appears as tooltip
      const topicExtractionButton = within(topicCard).getByRole('button', { name: 'Data' });

      expect(screen.queryByText('Revenue grew by 48% in Europe.')).not.toBeInTheDocument();
      expect(topicExtractionButton).toHaveAttribute('title', '1 hidden source sentence. Click to reveal.');
    });

    it('reveals and locks the source sentence on click, then clears it on second click', async () => {
      const { container } = render(<OverviewPage />);
      await screen.findByText('Topic A');

      const topicCard = screen.getByText('Topic A').closest('.rg-topic-card');
      fireEvent.click(within(topicCard).getByRole('button', { name: 'Expand' }));
      // Badge now shows extraction type ('Data' since no type field)
      const topicExtractionButton = within(topicCard).getByRole('button', { name: 'Data' });

      fireEvent.mouseEnter(topicExtractionButton);
      fireEvent.click(topicExtractionButton);
      fireEvent.mouseLeave(topicExtractionButton);

      expect(container.querySelector('.rg-sentence--active')).toHaveTextContent('Revenue grew by 48% in Europe.');
      expect(container.querySelector('.rg-sentence__text-highlight')?.textContent).toBe('48%');

      fireEvent.click(topicExtractionButton);

      expect(screen.queryByText('Revenue grew by 48% in Europe.')).not.toBeInTheDocument();
    });

    it('shows a hint on hover from the global dashboard and reveals on click', async () => {
      const { container } = render(<OverviewPage />);
      await screen.findByText('Data Points');

      const dashboard = screen.getByText('Data Points').closest('.rg-data-dashboard');
      const dashboardExtractionButton = within(dashboard).getByRole('button', { name: /Revenue growth:\s*Europe:\s*48%/ });

      expect(screen.queryByText('Revenue grew by 48% in Europe.')).not.toBeInTheDocument();
      expect(dashboardExtractionButton).toHaveAttribute('title', '1 hidden source sentence. Click to reveal.');
      expect(screen.queryByText('Revenue grew by 48% in Europe.')).not.toBeInTheDocument();

      fireEvent.click(dashboardExtractionButton);

      expect(container.querySelector('.rg-sentence--active')).toHaveTextContent('Revenue grew by 48% in Europe.');
    });

    it('falls back to sentence-level highlighting when no exact substring match exists', async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...annotationSubmission,
          results: {
            ...annotationSubmission.results,
            annotations: {
              ...annotationSubmission.results.annotations,
              data_extractions: [
                {
                  label: 'Revenue growth',
                  source_sentences: [2],
                  values: [{ key: 'Europe', value: '49%' }],
                  display_suggestion: 'table',
                },
              ],
            },
          },
        }),
      }));

      const { container } = render(<OverviewPage />);
      await screen.findByText('Data Points');

      const dashboard = screen.getByText('Data Points').closest('.rg-data-dashboard');
      const dashboardExtractionButton = within(dashboard).getByRole('button', { name: /Revenue growth:\s*Europe:\s*49%/ });

      fireEvent.click(dashboardExtractionButton);
      fireEvent.mouseEnter(dashboardExtractionButton);

      const activeSentence = container.querySelector('.rg-sentence--active');
      expect(activeSentence).not.toBeNull();
      expect(activeSentence.textContent).toContain('Revenue grew by 48% in Europe.');
      expect(container.querySelector('.rg-sentence__text-highlight')).toBeNull();
    });
  });

  it('shows generating banner when storytelling task is pending', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/read-progress')) {
        return { ok: true, json: async () => ({ read_count: 0, total_count: 3 }) };
      }
      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          tasks: { storytelling_generation: { status: 'processing' } },
          results: { ...mockSubmission.results, storytelling: {} },
        }),
      };
    });

    render(<OverviewPage />);
    await screen.findByText('Annotating article...');
  });
});
