import { useMemo } from "react";

/**
 * Transforms global topics into chart-compatible format.
 * Charts expect { name, sentences: [1-based indices] } topics + flat sentences[] string array.
 *
 * @param {Array} topics - [{ name, totalSentences, ... }]
 * @param {Object|null} sentencesByTopic - map of topicName -> string[] of real sentences (loaded lazily)
 */
export function useGlobalChartData(topics, sentencesByTopic) {
  return useMemo(() => {
    if (!topics || topics.length === 0) {
      return {
        chartTopics: [],
        chartSentences: [],
        allTopics: [],
        mindmapData: { topic_mindmaps: {}, sentences: [] },
      };
    }

    // Build contiguous synthetic indices for each topic
    let offset = 0;
    const chartTopics = topics.map((t) => {
      const count = t.totalSentences || 0;
      const sentences = [];
      for (let i = 0; i < count; i++) {
        sentences.push(offset + i + 1); // 1-based
      }
      offset += count;
      return { name: t.name, sentences };
    });

    // Flat sentences array: use real sentences when available, else topic name as placeholder
    const chartSentences = chartTopics.flatMap((t, i) => {
      const real = sentencesByTopic && sentencesByTopic[topics[i].name];
      return t.sentences.map((_, j) =>
        real && real[j] != null ? real[j] : topics[i].name,
      );
    });

    // allTopics: enriched with totalSentences and empty summary for TopicsBarChart
    const allTopics = chartTopics.map((t, i) => ({
      ...t,
      totalSentences: topics[i].totalSentences || 0,
      summary: "",
    }));

    // Build mindmap data from '>' delimited topic names
    const topic_mindmaps = {};
    chartTopics.forEach((t) => {
      const parts = t.name
        .split(">")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length === 0) return;

      const root = parts[0];
      if (!topic_mindmaps[root]) {
        topic_mindmaps[root] = { sentences: [], children: {} };
      }

      let node = topic_mindmaps[root];
      if (parts.length === 1) {
        node.sentences = [...node.sentences, ...t.sentences];
      } else {
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          if (!node.children[part]) {
            node.children[part] = { sentences: [], children: {} };
          }
          node = node.children[part];
          if (i === parts.length - 1) {
            node.sentences = [...node.sentences, ...t.sentences];
          }
        }
      }
    });

    const mindmapData = { topic_mindmaps, sentences: chartSentences };

    return { chartTopics, chartSentences, allTopics, mindmapData };
  }, [topics, sentencesByTopic]);
}
