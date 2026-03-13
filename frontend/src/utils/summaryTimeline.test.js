import { describe, it, expect } from 'vitest';
import {
  buildSummaryTimelineItems,
  chooseSummaryTopic,
  getTopicColorTokens,
  splitTopicPath
} from './summaryTimeline';

describe('summaryTimeline utilities', () => {
  describe('splitTopicPath', () => {
    it('splits and trims topic paths', () => {
      expect(splitTopicPath('Design > Structures > Loads')).toEqual(['Design', 'Structures', 'Loads']);
    });
  });

  describe('chooseSummaryTopic', () => {
    it('prefers the deepest overlapping topic path', () => {
      const mapping = { source_sentences: [2] };
      const topics = [
        { name: 'Design > Structures', sentences: [2, 3] },
        { name: 'Design > Structures > Load Paths', sentences: [2] }
      ];

      const match = chooseSummaryTopic(mapping, topics);

      expect(match.pathSegments).toEqual(['Design', 'Structures', 'Load Paths']);
    });

    it('breaks equal-depth ties by largest overlap count', () => {
      const mapping = { source_sentences: [3, 4] };
      const topics = [
        { name: 'Design > Studio', sentences: [3] },
        { name: 'Design > Structures', sentences: [3, 4] }
      ];

      const match = chooseSummaryTopic(mapping, topics);

      expect(match.topic.name).toBe('Design > Structures');
      expect(match.overlapCount).toBe(2);
    });

    it('breaks remaining ties by original topic order', () => {
      const mapping = { source_sentences: [5] };
      const topics = [
        { name: 'Design > Revit', sentences: [5] },
        { name: 'Design > Rhino', sentences: [5] }
      ];

      const match = chooseSummaryTopic(mapping, topics);

      expect(match.topic.name).toBe('Design > Revit');
    });
  });

  describe('buildSummaryTimelineItems', () => {
    it('marks section labels only when the top-level topic changes', () => {
      const items = buildSummaryTimelineItems(
        ['first', 'second', 'third'],
        [
          { summary_index: 0, source_sentences: [1] },
          { summary_index: 1, source_sentences: [2] },
          { summary_index: 2, source_sentences: [3] }
        ],
        [
          { name: 'Sophomore year > Revit', sentences: [1] },
          { name: 'Sophomore year > Structures', sentences: [2] },
          { name: 'Junior year > Competition', sentences: [3] }
        ]
      );

      expect(items.map((item) => item.showSectionLabel)).toEqual([true, false, true]);
      expect(items.map((item) => item.topLevelLabel)).toEqual(['Sophomore year', 'Sophomore year', 'Junior year']);
      expect(items.map((item) => item.subtopicLabel)).toEqual(['Revit', 'Structures', 'Competition']);
    });

    it('keeps unmatched summaries renderable without labels', () => {
      const items = buildSummaryTimelineItems(
        ['first'],
        [{ summary_index: 0, source_sentences: [99] }],
        [{ name: 'Design > Structures', sentences: [1, 2] }]
      );

      expect(items[0]).toMatchObject({
        topLevelLabel: '',
        subtopicLabel: '',
        showSectionLabel: false,
        topicColor: null
      });
    });
  });

  describe('getTopicColorTokens', () => {
    it('returns stable muted colors for the same topic', () => {
      const first = getTopicColorTokens('Sophomore year');
      const second = getTopicColorTokens('Sophomore year');

      expect(first).toEqual(second);
    });

    it('returns different colors for different top-level topics', () => {
      const first = getTopicColorTokens('Sophomore year');
      const second = getTopicColorTokens('Junior year');

      expect(first.accent).not.toBe(second.accent);
    });
  });
});
