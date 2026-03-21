import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
});
