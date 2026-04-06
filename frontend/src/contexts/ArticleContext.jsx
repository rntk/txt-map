import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { useSubmission } from "../hooks/useSubmission";
import { useTextPageData } from "../hooks/useTextPageData";

/**
 * Single source of truth for article data and shared UI state.
 * Wraps useSubmission + useTextPageData and also holds selectedTopics / hoveredTopic
 * so that any component in the tree can access them without prop drilling.
 */
const ArticleContext = createContext(null);

/**
 * @param {{ submissionId: string, children: React.ReactNode }} props
 */
export function ArticleProvider({ submissionId, children }) {
  const {
    submission,
    loading,
    error,
    fetchSubmission,
    readTopics,
    setReadTopics,
    toggleRead,
    setSelectionReadState,
    toggleReadAll,
    getSimilarWords,
  } = useSubmission(submissionId);

  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);

  const {
    safeTopics,
    rawText,
    articleSummaryText,
    articleSummaryBullets,
    topicSummaryParaMap,
    allTopics,
    rawTextHighlightRanges,
    rawTextFadeRanges,
    highlightedSummaryParas,
    articles,
    insights,
    insightNavItems,
    insightTopicNameSet,
    summaryTimelineItems,
    articleBulletMatches,
    articleTextMatches,
  } = useTextPageData(submission, selectedTopics, hoveredTopic, readTopics);

  // Stable references for the two submission sub-objects that would otherwise
  // create a new object literal on every render via `|| {}`.
  const topicSummaries = useMemo(
    () => submission?.results?.topic_summaries || {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submission?.results?.topic_summaries],
  );
  const markup = useMemo(
    () => submission?.results?.markup || {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submission?.results?.markup],
  );

  const toggleTopic = useCallback((topic) => {
    setSelectedTopics((prev) => {
      const exists = prev.some((t) => t.name === topic.name);
      if (exists) {
        setHoveredTopic(null);
      }
      return exists
        ? prev.filter((t) => t.name !== topic.name)
        : [...prev, topic];
    });
  }, []);

  // Memoize the context value so consumers only re-render when specific data
  // changes, not on every render of ArticleProvider.
  const value = useMemo(
    () => ({
      submissionId,
      submission,
      loading,
      error,
      fetchSubmission,
      readTopics,
      setReadTopics,
      toggleRead,
      setSelectionReadState,
      toggleReadAll,
      getSimilarWords,
      // derived data (each field is individually memoized inside useTextPageData)
      safeTopics,
      rawText,
      articleSummaryText,
      articleSummaryBullets,
      topicSummaryParaMap,
      allTopics,
      rawTextHighlightRanges,
      rawTextFadeRanges,
      highlightedSummaryParas,
      articles,
      insights,
      insightNavItems,
      insightTopicNameSet,
      summaryTimelineItems,
      articleBulletMatches,
      articleTextMatches,
      // cleaner aliases
      topics: safeTopics,
      enrichedTopics: allTopics,
      topicSummaries,
      markup,
      // shared UI state
      selectedTopics,
      hoveredTopic,
      setSelectedTopics,
      setHoveredTopic,
      toggleTopic,
    }),
    [
      submissionId,
      submission,
      loading,
      error,
      fetchSubmission,
      readTopics,
      setReadTopics,
      toggleRead,
      setSelectionReadState,
      toggleReadAll,
      getSimilarWords,
      safeTopics,
      rawText,
      articleSummaryText,
      articleSummaryBullets,
      topicSummaryParaMap,
      allTopics,
      rawTextHighlightRanges,
      rawTextFadeRanges,
      highlightedSummaryParas,
      articles,
      insights,
      insightNavItems,
      insightTopicNameSet,
      summaryTimelineItems,
      articleBulletMatches,
      articleTextMatches,
      topicSummaries,
      markup,
      selectedTopics,
      hoveredTopic,
      setSelectedTopics,
      setHoveredTopic,
      toggleTopic,
    ],
  );

  return (
    <ArticleContext.Provider value={value}>{children}</ArticleContext.Provider>
  );
}

/**
 * Returns the ArticleContext value, or null if rendered outside a provider.
 * Components should handle the null case gracefully (fall back to props).
 *
 * @returns {ReturnType<typeof import('../hooks/useTextPageData').useTextPageData> & {
 *   submissionId: string,
 *   submission: unknown,
 *   loading: boolean,
 *   error: string|null,
 *   fetchSubmission: () => void,
 *   readTopics: Set<string>,
 *   toggleRead: (topic: unknown) => void,
 *   topics: unknown[],
 *   enrichedTopics: unknown[],
 *   topicSummaries: Record<string, string>,
 *   markup: Record<string, unknown>,
 *   selectedTopics: unknown[],
 *   hoveredTopic: unknown,
 *   setSelectedTopics: (v: unknown) => void,
 *   setHoveredTopic: (v: unknown) => void,
 *   toggleTopic: (topic: unknown) => void,
 * } | null}
 */
export function useArticle() {
  return useContext(ArticleContext);
}
