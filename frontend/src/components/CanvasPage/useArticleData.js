import { useEffect, useState } from "react";
import { extractArticleImages } from "./articleImages";

function getSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getSafeObject(value) {
  return value && typeof value === "object" ? value : {};
}

/**
 * @param {Response} response
 * @returns {Promise<unknown>}
 */
async function parseJsonResponse(response) {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * @param {string} articleId
 * @param {AbortSignal} signal
 * @returns {Promise<Record<string, unknown>>}
 */
async function fetchArticlePayload(articleId, signal) {
  const response = await fetch(`/api/canvas/${articleId}/article`, {
    credentials: "include",
    signal,
  });
  return parseJsonResponse(response);
}

/**
 * @param {string} articleId
 * @param {AbortSignal} signal
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function fetchSubmissionPayload(articleId, signal) {
  const response = await fetch(`/api/submission/${articleId}`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

/**
 * @param {Record<string, unknown>} data
 * @returns {{
 *   articleText: string,
 *   articlePages: Array<{page_number: number, start: number, end: number}>,
 *   submissionSentences: string[],
 *   submissionTopics: Array<{name: string, sentences: number[]}>,
 *   readTopics: string[],
 *   topicSummaries: Record<string, unknown>,
 *   topicSummaryIndex: Record<string, unknown>,
 *   topicTemperatures: Record<string, unknown>,
 *   topicTagRankings: Record<string, Array<{tag: string, score: number}>>,
 *   insights: Array<Record<string, unknown>>,
 *   markup: Record<string, unknown>,
 * }}
 */
function normalizeArticlePayload(data) {
  return {
    articleText: typeof data.text === "string" ? data.text : "",
    articlePages: getSafeArray(data.pages),
    submissionSentences: getSafeArray(data.sentences),
    submissionTopics: getSafeArray(data.topics),
    readTopics: getSafeArray(data.read_topics),
    topicSummaries: getSafeObject(data.topic_summaries),
    topicSummaryIndex: getSafeObject(data.topic_summary_index),
    topicTemperatures: getSafeObject(data.topic_temperatures),
    topicTagRankings: getSafeObject(data.topic_tag_rankings),
    insights: getSafeArray(data.insights),
    markup: getSafeObject(data.markup),
  };
}

/**
 * @param {Record<string, unknown>} data
 * @param {string} fallbackText
 * @param {string} fallbackSourceUrl
 * @returns {Array<{src: string, alt: string, title?: string, anchorOffset: number}>}
 */
function extractPayloadImages(data, fallbackText, fallbackSourceUrl = "") {
  if (!data?.html_content) {
    return [];
  }

  return extractArticleImages(
    data.html_content,
    typeof data.source_url === "string" ? data.source_url : fallbackSourceUrl,
    fallbackText,
  );
}

/**
 * @param {string} articleId
 * @param {AbortSignal} signal
 * @param {string} articleText
 * @param {Record<string, unknown>} articleData
 * @returns {Promise<Array<{src: string, alt: string, title?: string, anchorOffset: number}>>}
 */
async function loadArticleImages(articleId, signal, articleText, articleData) {
  const articleImages = extractPayloadImages(articleData, articleText);
  if (articleImages.length > 0) {
    return articleImages;
  }

  const submissionData = await fetchSubmissionPayload(articleId, signal);
  const articleSourceUrl =
    typeof articleData.source_url === "string" ? articleData.source_url : "";
  return extractPayloadImages(submissionData, articleText, articleSourceUrl);
}

/**
 * Loads all article data needed for the canvas page.
 * @param {string} articleId
 * @returns {{
 *   articleText: string,
 *   articlePages: Array<{page_number: number, start: number, end: number}>,
 *   articleImages: Array<{src: string, alt: string, title?: string, anchorOffset: number}>,
 *   articleLoading: boolean,
 *   articleError: string | null,
 *   topicSummaries: Object,
 *   topicSummaryIndex: Object,
 *   submissionSentences: string[],
 *   submissionTopics: Array<{name: string, sentences: number[]}>,
 *   readTopics: string[],
 *   setReadTopics: React.Dispatch<React.SetStateAction<string[]>>,
 *   topicTemperatures: Object,
 *   topicTagRankings: Record<string, Array<{tag: string, score: number}>>,
 *   insights: Array<Object>,
 *   markup: Object,
 * }}
 */
export function useArticleData(articleId) {
  const [articleText, setArticleText] = useState("");
  const [articlePages, setArticlePages] = useState([]);
  const [articleImages, setArticleImages] = useState([]);
  const [articleLoading, setArticleLoading] = useState(true);
  const [articleError, setArticleError] = useState(null);
  const [topicSummaries, setTopicSummaries] = useState({});
  const [topicSummaryIndex, setTopicSummaryIndex] = useState({});
  const [submissionSentences, setSubmissionSentences] = useState([]);
  const [submissionTopics, setSubmissionTopics] = useState([]);
  const [readTopics, setReadTopics] = useState([]);
  const [topicTemperatures, setTopicTemperatures] = useState({});
  const [topicTagRankings, setTopicTagRankings] = useState({});
  const [insights, setInsights] = useState([]);
  const [markup, setMarkup] = useState({});

  useEffect(() => {
    if (!articleId) return;
    let cancelled = false;
    const controller = new AbortController();
    setArticleLoading(true);
    setArticleError(null);
    setArticleImages([]);
    setTopicTagRankings({});

    const loadArticle = async () => {
      try {
        const data = await fetchArticlePayload(articleId, controller.signal);
        if (cancelled) return;

        const normalizedData = normalizeArticlePayload(data);
        setArticleText(normalizedData.articleText);
        setArticlePages(normalizedData.articlePages);
        setSubmissionSentences(normalizedData.submissionSentences);
        setSubmissionTopics(normalizedData.submissionTopics);
        setReadTopics(normalizedData.readTopics);
        setTopicSummaries(normalizedData.topicSummaries);
        setTopicSummaryIndex(normalizedData.topicSummaryIndex);
        setTopicTemperatures(normalizedData.topicTemperatures);
        setTopicTagRankings(normalizedData.topicTagRankings);
        setInsights(normalizedData.insights);
        setMarkup(normalizedData.markup);
        setArticleLoading(false);

        let images = [];
        try {
          images = await loadArticleImages(
            articleId,
            controller.signal,
            normalizedData.articleText,
            data,
          );
        } catch (err) {
          if (err?.name === "AbortError") return;
        }

        if (cancelled) return;
        setArticleImages(images);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (cancelled) return;
        setArticleError(err.message);
        setArticleLoading(false);
      }
    };

    loadArticle();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [articleId]);

  return {
    articleText,
    articlePages,
    articleImages,
    articleLoading,
    articleError,
    topicSummaries,
    topicSummaryIndex,
    submissionSentences,
    submissionTopics,
    readTopics,
    setReadTopics,
    topicTemperatures,
    topicTagRankings,
    insights,
    markup,
  };
}
