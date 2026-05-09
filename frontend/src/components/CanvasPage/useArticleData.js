import { useEffect, useState } from "react";
import { extractArticleImages } from "./articleImages";

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
  const [insights, setInsights] = useState([]);
  const [markup, setMarkup] = useState({});

  useEffect(() => {
    if (!articleId) return;
    let cancelled = false;
    const controller = new AbortController();
    setArticleLoading(true);
    setArticleError(null);
    setArticleImages([]);

    const loadArticle = async () => {
      try {
        const response = await fetch(`/api/canvas/${articleId}/article`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (cancelled) return;

        setArticleText(data.text || "");
        setArticlePages(data.pages || []);
        setSubmissionSentences(data.sentences || []);
        setSubmissionTopics(data.topics || []);
        setReadTopics(data.read_topics || []);
        setTopicSummaries(data.topic_summaries || {});
        setTopicSummaryIndex(data.topic_summary_index || {});
        setTopicTemperatures(data.topic_temperatures || {});
        setInsights(data.insights || []);
        setMarkup(data.markup || {});
        setArticleLoading(false);

        let images = [];
        if (data.html_content) {
          images = extractArticleImages(
            data.html_content,
            data.source_url || "",
            data.text || "",
          );
        } else {
          try {
            const submissionResponse = await fetch(
              `/api/submission/${articleId}`,
              { credentials: "include", signal: controller.signal },
            );
            const submissionData = submissionResponse.ok
              ? await submissionResponse.json()
              : null;
            if (cancelled) return;
            if (submissionData?.html_content) {
              images = extractArticleImages(
                submissionData.html_content,
                submissionData.source_url || data.source_url || "",
                data.text || "",
              );
            }
          } catch (err) {
            if (err?.name === "AbortError") return;
          }
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
    insights,
    markup,
  };
}
