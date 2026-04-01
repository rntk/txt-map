import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DropdownMenu from './DropdownMenu';

describe('DropdownMenu', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('opens and closes when the trigger is clicked', async () => {
    render(
      <DropdownMenu buttonContent="Menu">
        <div>Menu content</div>
      </DropdownMenu>
    );

    expect(screen.queryByText('Menu content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByText('Menu content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await waitFor(() => {
      expect(screen.queryByText('Menu content')).not.toBeInTheDocument();
    });
  });

  it('closes when clicking outside the menu', async () => {
    render(
      <DropdownMenu buttonContent="Status">
        <div>Task content</div>
      </DropdownMenu>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(screen.getByText('Task content')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Task content')).not.toBeInTheDocument();
    });
  });
});
