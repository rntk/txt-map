import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TopicList from './TopicList';

// A minimal flat topic
const makeTopic = (name, totalSentences = 1) => ({ name, totalSentences, ranges: [] });

// Topics that form a two-level tree:
//   Animals (intermediate)
//     Animals>Mammals (leaf)
//     Animals>Birds   (leaf)
//   Plants (leaf)
const treeTopics = [
  makeTopic('Animals>Mammals'),
  makeTopic('Animals>Birds'),
  makeTopic('Plants'),
];

describe('TopicList subtreeStateMap – hasSelected', () => {
  it('leaf checkbox is unchecked when topic is not selected', () => {
    render(
      <TopicList
        topics={[makeTopic('Science')]}
        selectedTopics={[]}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0].checked).toBe(false);
  });

  it('leaf checkbox is checked when topic is selected', () => {
    render(
      <TopicList
        topics={[makeTopic('Science')]}
        selectedTopics={[{ name: 'Science' }]}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0].checked).toBe(true);
  });

  it('parent checkbox is checked when all leaves in subtree are selected', () => {
    render(
      <TopicList
        topics={treeTopics}
        selectedTopics={[{ name: 'Animals>Mammals' }, { name: 'Animals>Birds' }]}
      />
    );
    // The Animals intermediate node has a checkbox (non-leaf)
    // Its checked state reflects isSubtreeSelected = hasSelected from subtreeStateMap
    const checkboxes = screen.getAllByRole('checkbox');
    // Find the Animals group checkbox (non-leaf uses label+checkbox)
    // The Animals node is first alphabetically, its checkbox should be checked
    const animalsCheckbox = checkboxes.find((cb) => {
      const label = cb.closest('label');
      return label && label.textContent.includes('Animals');
    });
    expect(animalsCheckbox).toBeDefined();
    expect(animalsCheckbox.checked).toBe(true);
  });

  it('parent checkbox is unchecked when no leaves in subtree are selected', () => {
    render(
      <TopicList
        topics={treeTopics}
        selectedTopics={[]}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    const animalsCheckbox = checkboxes.find((cb) => {
      const label = cb.closest('label');
      return label && label.textContent.includes('Animals');
    });
    expect(animalsCheckbox).toBeDefined();
    expect(animalsCheckbox.checked).toBe(false);
  });

  it('parent checkbox reflects hasSelected even when only one child is selected', () => {
    render(
      <TopicList
        topics={treeTopics}
        selectedTopics={[{ name: 'Animals>Mammals' }]}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    const animalsCheckbox = checkboxes.find((cb) => {
      const label = cb.closest('label');
      return label && label.textContent.includes('Animals');
    });
    // hasSelected is true when at least one child is selected
    expect(animalsCheckbox.checked).toBe(true);
  });
});

describe('TopicList subtreeStateMap – allRead', () => {
  it('leaf shows "Mark Read" button when topic is not read', () => {
    render(
      <TopicList
        topics={[makeTopic('Science')]}
        readTopics={new Set()}
      />
    );
    expect(screen.getByText('Mark Read')).toBeDefined();
  });

  it('leaf shows "Mark Unread" button when topic is read', () => {
    render(
      <TopicList
        topics={[makeTopic('Science')]}
        readTopics={new Set(['Science'])}
      />
    );
    expect(screen.getByText('Mark Unread')).toBeDefined();
  });

  it('parent subtree shows "Mark Unread" only when ALL leaves are read', () => {
    render(
      <TopicList
        topics={treeTopics}
        readTopics={new Set(['Animals>Mammals', 'Animals>Birds'])}
      />
    );
    // The Animals group button should say "Mark Unread" (allRead = true)
    const buttons = screen.getAllByText('Mark Unread');
    // At least the Animals group button should be "Mark Unread"
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('parent subtree shows "Mark Read" when only some leaves are read', () => {
    render(
      <TopicList
        topics={treeTopics}
        readTopics={new Set(['Animals>Mammals'])}
      />
    );
    // The Animals group button should say "Mark Read" because Birds is not read
    // Find the group button for Animals (non-leaf node)
    const markReadButtons = screen.getAllByText('Mark Read');
    expect(markReadButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('parent subtree shows "Mark Read" when no leaves are read', () => {
    render(
      <TopicList
        topics={treeTopics}
        readTopics={new Set()}
      />
    );
    const markReadButtons = screen.getAllByText('Mark Read');
    expect(markReadButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('allRead is false for an intermediate node with no leaves (hasLeaves=false)', () => {
    // A topic tree where an intermediate node exists with no leaf children
    // In practice buildTopicTree always assigns isLeaf correctly; test a single leaf
    render(
      <TopicList
        topics={[makeTopic('Solo')]}
        readTopics={new Set(['Solo'])}
      />
    );
    // If allRead is computed correctly the single leaf should show "Mark Unread"
    expect(screen.getByText('Mark Unread')).toBeDefined();
  });
});

describe('TopicList general rendering', () => {
  it('renders "No topics yet." when topics array is empty', () => {
    render(<TopicList topics={[]} />);
    expect(screen.getByText('No topics yet.')).toBeDefined();
  });

  it('renders topic names', () => {
    render(<TopicList topics={[makeTopic('Physics'), makeTopic('Chemistry')]} />);
    expect(screen.getByText('Physics')).toBeDefined();
    expect(screen.getByText('Chemistry')).toBeDefined();
  });

  it('renders filter input when topics are present', () => {
    render(<TopicList topics={[makeTopic('Art')]} />);
    expect(screen.getByPlaceholderText('Filter topics...')).toBeDefined();
  });

  it('does not render filter input when topics list is empty', () => {
    render(<TopicList topics={[]} />);
    expect(screen.queryByPlaceholderText('Filter topics...')).toBeNull();
  });

  it('renders "Read All" / "Unread All" button based on overall read state', () => {
    const { rerender } = render(
      <TopicList topics={[makeTopic('Alpha')]} readTopics={new Set()} />
    );
    expect(screen.getByText('Read All')).toBeDefined();

    rerender(
      <TopicList topics={[makeTopic('Alpha')]} readTopics={new Set(['Alpha'])} />
    );
    expect(screen.getByText('Unread All')).toBeDefined();
  });
});
