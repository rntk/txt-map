import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SummarySourceMenu from './SummarySourceMenu';

describe('SummarySourceMenu', () => {
  it('renders matches and calls onSelect with the chosen topic', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <SummarySourceMenu
        matches={[
          {
            topic: { name: 'Science > Physics' },
            score: 0.92,
            sentenceIndices: [1, 2],
          },
          {
            topic: { name: 'Science > Chemistry' },
            score: 0.75,
            sentenceIndices: [4],
          },
        ]}
        onSelect={onSelect}
        onClose={onClose}
        x={40}
        y={50}
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /Science > Physics/i }));

    expect(onSelect).toHaveBeenCalledWith({ name: 'Science > Physics' }, [1, 2]);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('menu').getAttribute('style')).toContain('--summary-source-menu-left: 40px');
    expect(screen.getByRole('menu').getAttribute('style')).toContain('--summary-source-menu-top: 50px');
    expect(screen.getByText('92%')).toBeInTheDocument();
  });
});
