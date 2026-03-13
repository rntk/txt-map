import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import TopicsBarChart from './TopicsBarChart';

describe('TopicsBarChart', () => {
  it('renders the empty state when there are no second-level topics', () => {
    render(<TopicsBarChart topics={[{ name: 'Science', sentences: [1] }]} sentences={['Sentence one.']} />);

    expect(screen.getByText('No second-level subtopic data available.')).toBeInTheDocument();
  });

  it('renders a dedicated scroll container for topic rows', () => {
    const topics = [
      { name: 'Science>Physics', sentences: [1] },
      { name: 'Arts>Music', sentences: [2] },
    ];

    render(<TopicsBarChart topics={topics} sentences={['alpha', 'beta']} />);

    expect(screen.getByText('Topics Overview')).toBeInTheDocument();
    expect(screen.getByTestId('topics-bar-chart-scroll')).toBeInTheDocument();
    expect(screen.getByText('Science')).toBeInTheDocument();
    expect(screen.getByText('Arts')).toBeInTheDocument();
  });

  it('aggregates repeated deeper topics under a single second-level bar', () => {
    const topics = [
      { name: 'Science>Physics>Quantum', sentences: [1] },
      { name: 'Science>Physics>Relativity', sentences: [2] },
      { name: 'Science>Biology', sentences: [3] },
    ];
    const sentences = ['aaaa', 'bbbbbb', 'cc'];

    render(<TopicsBarChart topics={topics} sentences={sentences} />);

    expect(screen.getByText('Total: 12 characters')).toBeInTheDocument();

    const rowLabel = screen.getByText('Science>Physics');
    const row = rowLabel.closest('.topics-bar-chart__row');

    expect(row).not.toBeNull();
    expect(within(row).getByText('10')).toBeInTheDocument();
    expect(screen.getByText('(Quantum, Relativity)')).toBeInTheDocument();
    expect(screen.getByText('Science>Biology')).toBeInTheDocument();
  });
});
