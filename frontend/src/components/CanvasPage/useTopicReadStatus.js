import { useCallback, useMemo } from "react";
import { isTopicRead } from "../../utils/topicReadUtils";

/**
 * Manages read/unread state for topics: persistence, toggle, and derived ranges.
 * @param {{
 *   articleId: string,
 *   submissionTopics: Array<{name: string, sentences: number[]}>,
 *   submissionSentences: string[],
 *   readTopics: string[],
 *   setReadTopics: React.Dispatch<React.SetStateAction<string[]>>,
 * }} params
 * @returns {{
 *   toggleTopicRead: (topicName: string) => void,
 *   readSentenceIndices: Set<number>,
 *   readRanges: Array<{start: number, end: number}>,
 * }}
 */
export function useTopicReadStatus({
  articleId,
  submissionTopics,
  submissionSentences,
  readTopics,
  setReadTopics,
}) {
  const persistReadTopics = useCallback(
    (nextTopics) => {
      if (!articleId) return;
      fetch(`/api/submission/${articleId}/read-topics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ read_topics: nextTopics }),
      }).catch(() => {});
    },
    [articleId],
  );

  const toggleTopicRead = useCallback(
    (topicName) => {
      setReadTopics((prev) => {
        const set = new Set(prev || []);
        if (set.has(topicName)) {
          set.delete(topicName);
        } else {
          set.add(topicName);
        }
        const next = Array.from(set);
        persistReadTopics(next);
        return next;
      });
    },
    [persistReadTopics, setReadTopics],
  );

  const readSentenceIndices = useMemo(() => {
    const set = new Set();
    (submissionTopics || []).forEach((topic) => {
      if (!isTopicRead(topic.name, readTopics)) return;
      const sents = Array.isArray(topic.sentences) ? topic.sentences : [];
      sents.forEach((num) => set.add(num - 1));
    });
    return set;
  }, [submissionTopics, readTopics]);

  const readRanges = useMemo(() => {
    if (submissionSentences.length === 0) return [];
    const ranges = [];
    let offset = 0;
    for (let i = 0; i < submissionSentences.length; i++) {
      const len = submissionSentences[i].length;
      if (readSentenceIndices.has(i)) {
        ranges.push({ start: offset, end: offset + len });
      }
      offset += len + 1;
    }
    return ranges;
  }, [submissionSentences, readSentenceIndices]);

  return { toggleTopicRead, readSentenceIndices, readRanges };
}
