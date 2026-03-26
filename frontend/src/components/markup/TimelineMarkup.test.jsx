import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimelineMarkup from './TimelineMarkup';

vi.mock('../annotations/charts/DataTimelineChart', () => ({
  default: ({ extraction }) => (
    <div data-testid="timeline-chart">
      {extraction.values.map((value, index) => (
        <div key={index}>
          {value.key}|{value.date}|{value.value}
        </div>
      ))}
    </div>
  ),
}));

describe('TimelineMarkup', () => {
  it('prefers event descriptions and falls back to sentence text', () => {
    render(
      <TimelineMarkup
        segment={{
          data: {
            events: [
              {
                position_index: 1,
                date: '2026-02-08',
                description: 'Launch day',
              },
              {
                position_index: 2,
                date: '2026-02-09',
              },
            ],
          },
        }}
        sentences={[
          'Ignored sentence text.',
          'Fallback event summary.',
        ]}
      />
    );

    const chart = screen.getByTestId('timeline-chart');

    expect(chart).toHaveTextContent('Launch day|2026-02-08|2026-02-08');
    expect(chart).toHaveTextContent('Fallback event summary.|2026-02-09|');
  });
});
