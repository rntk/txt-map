import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import StatusIndicator from './StatusIndicator';

describe('StatusIndicator', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders task pills with state classes and opens a detail popover', () => {
    render(
      <StatusIndicator
        tasks={{
          build_queue: {
            status: 'processing',
            started_at: '2026-04-01T00:00:00.000Z',
          },
          publish: {
            status: 'completed',
            started_at: '2026-04-01T01:00:00.000Z',
            completed_at: '2026-04-01T01:00:00.000Z',
          },
        }}
      />
    );

    const processingButton = screen.getByRole('button', { name: /build queue processing/i });
    expect(processingButton).toHaveClass('shared-status-pill--processing');
    expect(within(processingButton).getByText('⟳')).toHaveClass('shared-status-pill__icon--processing');

    fireEvent.click(processingButton);

    const duration = screen.getByText(/Duration:/);
    const detail = duration.closest('.shared-status-detail');
    expect(detail).toBeInTheDocument();
    expect(within(detail).getByText('processing')).toHaveClass('shared-status-detail__status--processing');
    expect(duration).toBeInTheDocument();
  });

  it('shows task errors and closes on outside click', async () => {
    render(
      <StatusIndicator
        tasks={{
          publish: {
            status: 'failed',
            started_at: '2026-04-01T01:00:00.000Z',
            completed_at: '2026-04-01T01:00:00.000Z',
            error: 'Queue write failed',
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /publish failed/i }));

    expect(screen.getByText('Queue write failed')).toHaveClass('shared-status-detail__error');

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Queue write failed')).not.toBeInTheDocument();
    });
  });
});
