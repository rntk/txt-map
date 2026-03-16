import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RefreshButton from './RefreshButton';

describe('RefreshButton', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders with default label', () => {
    render(<RefreshButton submissionId="abc123" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByRole('button').textContent).toContain('Refresh');
  });

  it('applies compact class when compact prop is true', () => {
    render(<RefreshButton submissionId="abc123" compact />);
    expect(screen.getByRole('button')).toHaveClass('refresh-btn--compact');
  });

  it('applies normal class when compact prop is false', () => {
    render(<RefreshButton submissionId="abc123" compact={false} />);
    expect(screen.getByRole('button')).toHaveClass('refresh-btn--normal');
  });

  it('shows loading indicator and disables button while fetching', async () => {
    // Fetch that never resolves during this test
    let resolveFetch;
    global.fetch = vi.fn(() => new Promise(resolve => { resolveFetch = resolve; }));

    render(<RefreshButton submissionId="sub42" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByRole('button').textContent).toBe('...');
    });

    // Clean up
    resolveFetch({ ok: true, text: async () => '' });
  });

  it('calls onRefresh callback after a successful fetch', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
    const onRefresh = vi.fn();

    render(<RefreshButton submissionId="sub99" onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('does not call onRefresh when the fetch response is not ok', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, text: async () => 'Server error' })
    );
    const onRefresh = vi.fn();

    render(<RefreshButton submissionId="sub77" onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button'));

    // Give time for the async handler to complete
    await waitFor(() =>
      expect(screen.getByRole('button')).not.toBeDisabled()
    );
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('re-enables button after fetch completes regardless of success', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true }));

    render(<RefreshButton submissionId="sub1" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(screen.getByRole('button')).not.toBeDisabled()
    );
  });

  it('POSTs to the correct submission endpoint', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true }));

    render(<RefreshButton submissionId="myid123" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('myid123');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ tasks: ['all'] });
  });
});
