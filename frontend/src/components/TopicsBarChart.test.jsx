import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import TopicsBarChart from './TopicsBarChart';

describe('TopicsBarChart', () => {
  const topics = [
    { name: 'Science', sentences: [1, 2] },
    { name: 'Science>Physics', sentences: [3, 4] },
    { name: 'Science>Physics>Quantum', sentences: [5] },
    { name: 'Science>Physics>Relativity', sentences: [6] },
    { name: 'Science>Biology', sentences: [7] },
    { name: 'Arts>Music', sentences: [8] },
  ];

  const sentences = [
    'Sentence one.',
    'Sentence two.',
    'Sentence three.',
    'Sentence four.',
    'Sentence five.',
    'Sentence six.',
    'Sentence seven.',
    'Sentence eight.',
  ];

  it('renders a dedicated scroll container for topic rows', () => {
    render(<TopicsBarChart topics={topics} sentences={sentences} />);

    expect(screen.getByText('Topics Overview')).toBeInTheDocument();
    expect(screen.getByText('Topic Level:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Level 0 (Main Topics)' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'All Topics' })).toBeDisabled();
    expect(screen.getByText('Showing all topics at relative level 0 (Main Topics).')).toBeInTheDocument();
    expect(screen.getByTestId('topics-bar-chart-scroll')).toBeInTheDocument();
    expect(screen.getByText('Science')).toBeInTheDocument();
    expect(screen.getByText('Arts')).toBeInTheDocument();
  });

  it('switches to level 1 and aggregates child previews for drillable rows', () => {
    render(<TopicsBarChart topics={topics} sentences={sentences} />);

    fireEvent.click(screen.getByRole('button', { name: 'Level 1 (Subtopics)' }));

    expect(screen.getByText('Showing all topics at relative level 1 (Subtopics).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Level 1 (Subtopics)' })).toHaveClass('active');
    expect(screen.getByText('Physics')).toBeInTheDocument();
    expect(screen.getByText('Biology')).toBeInTheDocument();
    expect(screen.getByText('Music')).toBeInTheDocument();

    const row = screen.getByTestId('topics-bar-chart-row-science-physics');
    expect(row).not.toBeNull();
    expect(within(row).getByText('29')).toBeInTheDocument();
    expect(screen.getByText('(Quantum, Relativity)')).toBeInTheDocument();
  });

  it('drills into a branch from a deeper level and resets to level 0', () => {
    render(<TopicsBarChart topics={topics} sentences={sentences} />);

    fireEvent.click(screen.getByRole('button', { name: 'Level 1 (Subtopics)' }));
    fireEvent.click(screen.getByTestId('topics-bar-chart-row-science-physics'));

    expect(screen.getByText('Inside Physics at relative level 0 (Main Topics).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Physics' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Level 0 (Main Topics)' })).toHaveClass('active');
    expect(screen.getByText('Quantum')).toBeInTheDocument();
    expect(screen.getByText('Relativity')).toBeInTheDocument();
    expect(screen.queryByText('Music')).not.toBeInTheDocument();
  });

  it('preserves the selected relative level when navigating back through breadcrumbs', () => {
    render(<TopicsBarChart topics={topics} sentences={sentences} />);

    fireEvent.click(screen.getByTestId('topics-bar-chart-row-science'));
    fireEvent.click(screen.getByRole('button', { name: 'Level 1 (Subtopics)' }));
    fireEvent.click(screen.getByRole('button', { name: 'All Topics' }));

    expect(screen.getByText('Showing all topics at relative level 1 (Subtopics).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Level 1 (Subtopics)' })).toHaveClass('active');
    expect(screen.getByText('Music')).toBeInTheDocument();
  });

  it('does not drill into a leaf topic', () => {
    render(<TopicsBarChart topics={topics} sentences={sentences} />);

    fireEvent.click(screen.getByTestId('topics-bar-chart-row-science'));
    fireEvent.click(screen.getByTestId('topics-bar-chart-row-science-biology'));

    expect(screen.getByText('Inside Science at relative level 0 (Main Topics).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Science' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Biology' })).not.toBeInTheDocument();
    expect(screen.getByText('Physics')).toBeInTheDocument();
  });

  it('opens a modal with the scoped topic sentences', () => {
    render(<TopicsBarChart topics={topics} sentences={sentences} />);

    fireEvent.click(screen.getByRole('button', { name: 'View sentences for Science' }));

    expect(screen.getByRole('heading', { name: 'Science' })).toBeInTheDocument();
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('Sentence one.')).toBeInTheDocument();
    expect(screen.getByText('Sentence two.')).toBeInTheDocument();
  });

  it('renders the empty state when there is no topic data', () => {
    render(<TopicsBarChart topics={[]} sentences={[]} />);

    expect(screen.getByText('No topic data available.')).toBeInTheDocument();
  });
});
