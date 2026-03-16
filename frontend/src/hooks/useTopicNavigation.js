import { useCallback } from 'react';
import { normalizeCharRange } from '../utils/textHighlight';

export function useTopicNavigation({
  activeTab,
  rawText,
  safeTopics,
  groupedByTopics,
  selectedTopics,
  topicSummaryParaMap,
  setHighlightedGroupedTopic,
}) {
  const getSentenceElement = (articleIndex, sentenceIndex) => {
    const byId = document.getElementById(`sentence-${articleIndex}-${sentenceIndex}`);
    if (byId) {
      return byId;
    }
    return document.querySelector(
      `[data-article-index="${articleIndex}"][data-sentence-index="${sentenceIndex}"]`
    );
  };

  const getCharElement = (articleIndex, charStart) => {
    const exact = document.querySelector(
      `[data-article-index="${articleIndex}"][data-char-start="${charStart}"]`
    );
    if (exact) {
      return exact;
    }

    const candidates = Array.from(
      document.querySelectorAll(`[data-article-index="${articleIndex}"][data-char-start]`)
    );
    if (candidates.length === 0) {
      return null;
    }

    const withOffsets = candidates
      .map((el) => ({
        el,
        start: Number(el.getAttribute('data-char-start'))
      }))
      .filter((entry) => Number.isFinite(entry.start))
      .sort((a, b) => a.start - b.start);

    const firstAfter = withOffsets.find((entry) => entry.start >= charStart);
    if (firstAfter) {
      return firstAfter.el;
    }

    return withOffsets[withOffsets.length - 1].el;
  };

  const getTopicAnchors = (topic) => {
    if (!topic || !topic.name) {
      return [];
    }

    const related = safeTopics.find((t) => t.name === topic.name);
    if (!related) {
      return [];
    }

    const ranges = Array.isArray(related.ranges) ? related.ranges : [];
    const anchors = ranges
      .map((range) => {
        const normalizedRange = activeTab === 'raw_text'
          ? normalizeCharRange(range, rawText.length)
          : {
            start: Number(range?.start),
            end: Number(range?.end)
          };

        if (!normalizedRange) {
          return null;
        }

        return {
          charStart: normalizedRange.start,
          charEnd: normalizedRange.end,
          sentenceStart: Number(range?.sentence_start) - 1
        };
      })
      .filter((target) => target && Number.isFinite(target.charStart) && Number.isFinite(target.charEnd))
      .sort((a, b) => a.charStart - b.charStart);

    if (anchors.length > 0) {
      return anchors;
    }

    const sentenceTargets = Array.isArray(related.sentences) ? related.sentences : [];
    return sentenceTargets
      .map((num) => Number(num) - 1)
      .filter((index) => Number.isInteger(index) && index >= 0)
      .sort((a, b) => a - b)
      .map((sentenceStart) => ({
        sentenceStart
      }));
  };

  const navigateTopicSentence = useCallback((topic, direction = 'next') => {
    if (groupedByTopics) {
      const isSelected = (name) => selectedTopics.some(t => t.name === name);
      const highlightSection = (name) => {
        setHighlightedGroupedTopic(name);
        if (!isSelected(name)) {
          setTimeout(() => setHighlightedGroupedTopic(null), 1500);
        }
      };
      if (direction === 'focus') {
        const el = document.getElementById(`grouped-topic-${topic.name}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightSection(topic.name);
        }
      } else {
        const allSections = Array.from(document.querySelectorAll('[id^="grouped-topic-"]'));
        const currentId = `grouped-topic-${topic.name}`;
        const currentIdx = allSections.findIndex(el => el.id === currentId);
        let targetIdx = currentIdx;
        if (direction === 'next') {
          targetIdx = currentIdx < allSections.length - 1 ? currentIdx + 1 : currentIdx;
        } else {
          targetIdx = currentIdx > 0 ? currentIdx - 1 : 0;
        }
        const targetEl = allSections[targetIdx];
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightSection(targetEl.id.replace('grouped-topic-', ''));
        }
      }
      return;
    }

    if (activeTab === 'summary') {
      const paraIndices = topicSummaryParaMap[topic.name];
      if (!paraIndices || paraIndices.length === 0) return;

      if (direction === 'focus') {
        const el = document.getElementById(`summary-para-${paraIndices[0]}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const viewportTop = window.scrollY || document.documentElement.scrollTop || 0;
      const viewportBottom = viewportTop + (window.innerHeight || document.documentElement.clientHeight || 0);
      const margin = 8;

      let targetEl = null;
      if (direction === 'next') {
        for (const idx of paraIndices) {
          const el = document.getElementById(`summary-para-${idx}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top + window.scrollY > viewportBottom - margin) {
              targetEl = el;
              break;
            }
          }
        }
      } else {
        for (let i = paraIndices.length - 1; i >= 0; i -= 1) {
          const el = document.getElementById(`summary-para-${paraIndices[i]}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.bottom + window.scrollY < viewportTop + margin) {
              targetEl = el;
              break;
            }
          }
        }
      }

      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const targets = getTopicAnchors(topic);
    if (targets.length === 0) return;

    const viewportTop = window.scrollY || document.documentElement.scrollTop || 0;
    const viewportBottom = viewportTop + (window.innerHeight || document.documentElement.clientHeight || 0);
    const margin = 8;

    const resolveElement = (target) => {
      if (Number.isFinite(target.charStart)) {
        return getCharElement(0, target.charStart);
      }
      return getSentenceElement(0, target.sentenceStart);
    };

    if (direction === 'focus') {
      const targetEl = resolveElement(targets[0]);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    let targetIndex = -1;
    if (direction === 'next') {
      for (let i = 0; i < targets.length; i += 1) {
        const el = resolveElement(targets[i]);
        if (el) {
          const rect = el.getBoundingClientRect();
          const absTop = rect.top + window.scrollY;
          if (absTop > viewportBottom - margin) {
            targetIndex = i;
            break;
          }
        }
      }
    } else {
      for (let i = targets.length - 1; i >= 0; i -= 1) {
        const el = resolveElement(targets[i]);
        if (el) {
          const rect = el.getBoundingClientRect();
          const absBottom = rect.bottom + window.scrollY;
          if (absBottom < viewportTop + margin) {
            targetIndex = i;
            break;
          }
        }
      }
    }

    if (targetIndex === -1) return;

    const targetEl = resolveElement(targets[targetIndex]);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeTab, rawText, safeTopics, groupedByTopics, selectedTopics, topicSummaryParaMap, setHighlightedGroupedTopic]);

  return { navigateTopicSentence };
}
