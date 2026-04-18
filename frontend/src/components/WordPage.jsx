import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { ArticleProvider, useArticle } from "../contexts/ArticleContext";
import TextDisplay from "./TextDisplay";
import CircularPackingChart from "./CircularPackingChart";
import TreemapChart from "./TreemapChart";
import TopicsTagCloud from "./TopicsTagCloud";
import SummaryTimeline from "./SummaryTimeline";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import WordTree, { buildWordTreeEntries } from "./WordTree";
import GlobalTopicsCompareView from "./GlobalTopicsCompareView";
import MarkupRenderer from "./markup/MarkupRenderer";
import {
  resolveTopicMarkup,
  getTopicMarkupRanges,
} from "./markup/topicMarkupUtils";
import {
  buildModalSelectionFromSummarySource,
  buildTopicModalSelection,
} from "../utils/topicModalSelection";
import "./WordPage.css";

/**
 * @typedef {Object} WordPageTab
 * @property {string} key
 * @property {string} label
 */

/**
 * @typedef {Object} WordPageTopic
 * @property {string} name
 * @property {number[]} [sentences]
 */

/**
 * @typedef {{ start: number, end: number }} CharacterRange
 */

/** @type {readonly WordPageTab[]} */
const VIS_TABS = [
  { key: "sentences", label: "Sentences" },
  { key: "compare", label: "Compare" },
  { key: "tree", label: "Tree" },
  { key: "circles", label: "Topics (Circles)" },
  { key: "treemap", label: "Topics (Treemap)" },
  { key: "summaries", label: "Summaries" },
  { key: "tags", label: "Tags Cloud" },
];

/**
 * @returns {React.JSX.Element}
 */
export default function WordPage() {
  const pathParts = window.location.pathname.split("/");
  const submissionId = pathParts[3];
  const word = decodeURIComponent(pathParts[4] || "");
  return (
    <ArticleProvider submissionId={submissionId}>
      <WordPageContent word={word} />
    </ArticleProvider>
  );
}

/**
 * @param {{ word: string }} props
 * @returns {React.JSX.Element}
 */
function WordPageContent({ word }) {
  const {
    submissionId,
    submission,
    loading,
    error,
    readTopics,
    toggleRead,
    summaryTimelineItems: allTimelineItems,
    getSimilarWords,
    allTopics: enrichedTopics,
  } = useArticle();

  /**
   * @param {string} path
   * @returns {void}
   */
  const navigate = (path) => {
    window.location.href = path;
  };

  const [activeTab, setActiveTab] = useState("sentences");
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic] = useState(null);
  const [summaryModalTopic, setSummaryModalTopic] = useState(null);
  const [tooltipEnabled, setTooltipEnabled] = useState(true);
  const [summaryKeywordHighlightEnabled, setSummaryKeywordHighlightEnabled] =
    useState(false);
  const compareGroupRefs = useRef({});

  const [sentenceTabMap, setSentenceTabMap] = useState({});
  const [similarWords, setSimilarWords] = useState([]);

  // Word-context highlights state
  const [wordContextStatus, setWordContextStatus] = useState(null);
  // null = not started; {status, total, completed, highlights}
  const [wordContextHighlightsEnabled, setWordContextHighlightsEnabled] =
    useState(false);
  const wordContextPollingRef = useRef(null);

  useEffect(() => {
    if (word) {
      getSimilarWords(word).then(setSimilarWords);
    }
  }, [word, getSimilarWords]);

  // Cleanup polling on unmount, word change, or submissionId change
  useEffect(() => {
    return () => {
      if (wordContextPollingRef.current) {
        clearTimeout(wordContextPollingRef.current);
        wordContextPollingRef.current = null;
      }
    };
  }, [word, submissionId]);

  const wordContextPollRetries = useRef(0);
  const MAX_POLL_RETRIES = 10;

  const pollWordContextStatus = useCallback(() => {
    fetch(
      `/api/submission/${submissionId}/word-context-highlights?word=${encodeURIComponent(word)}`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`Unexpected status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        wordContextPollRetries.current = 0;
        setWordContextStatus((prev) => {
          if (prev?.status === "pending" && data.status === "completed") {
            setWordContextHighlightsEnabled(true);
          }
          return {
            ...prev,
            status: data.status,
            total: data.total,
            completed: data.completed,
            highlights: data.highlights || {},
          };
        });
        if (data.status === "pending") {
          wordContextPollingRef.current = setTimeout(
            pollWordContextStatus,
            1500,
          );
        }
      })
      .catch(() => {
        wordContextPollRetries.current += 1;
        if (wordContextPollRetries.current < MAX_POLL_RETRIES) {
          const delay = Math.min(3000 * wordContextPollRetries.current, 30000);
          wordContextPollingRef.current = setTimeout(
            pollWordContextStatus,
            delay,
          );
        } else {
          setWordContextStatus((prev) => ({ ...prev, status: "error" }));
        }
      });
  }, [submissionId, word]);

  const startWordContextAnalysis = useCallback(() => {
    if (wordContextPollingRef.current) {
      clearTimeout(wordContextPollingRef.current);
    }
    setWordContextStatus({
      status: "pending",
      total: 0,
      completed: 0,
      highlights: {},
    });
    fetch(`/api/submission/${submissionId}/word-context-highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, refresh: true }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Unexpected status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setWordContextStatus({
          status: data.status,
          total: data.total,
          completed: data.completed,
          highlights: data.highlights || {},
        });
        if (data.status === "completed") {
          setWordContextHighlightsEnabled(true);
        } else if (data.status === "pending") {
          wordContextPollRetries.current = 0;
          wordContextPollingRef.current = setTimeout(
            pollWordContextStatus,
            1500,
          );
        }
      })
      .catch(() => {
        setWordContextStatus(null);
      });
  }, [submissionId, word, pollWordContextStatus]);

  // Derive subsets
  const matchingData = useMemo(() => {
    if (!submission?.results) {
      return {
        sentencesInfo: [],
        topics: [],
        summaries: [],
        timelineItems: [],
        allSentences: [],
        allTopics: [],
        treeEntries: [],
      };
    }

    const allSentences = submission.results.sentences || [];
    const allTopics = Array.isArray(enrichedTopics) ? enrichedTopics : [];
    const treeEntries = buildWordTreeEntries(allSentences, word);
    const matchedSentencesInfo = [];
    const matchedSentence1BasedIndices = new Set();
    const seenSentenceIndices = new Set();

    treeEntries.forEach((entry) => {
      if (seenSentenceIndices.has(entry.sentenceIndex)) {
        return;
      }

      seenSentenceIndices.add(entry.sentenceIndex);
      matchedSentencesInfo.push({
        index: entry.sentenceIndex,
        text: allSentences[entry.sentenceIndex] || "",
      });
      matchedSentence1BasedIndices.add(entry.sentenceNumber);
    });

    // 2. Find topics containing matched sentences
    const matchedTopics = allTopics
      .map((topic) => {
        const topicSents = Array.isArray(topic.sentences)
          ? topic.sentences
          : [];
        // Intersection
        const intersection = topicSents.filter((idx) =>
          matchedSentence1BasedIndices.has(idx),
        );
        if (intersection.length > 0) {
          return { ...topic, sentences: intersection };
        }
        return null;
      })
      .filter(Boolean);

    // 3. Summaries
    const validSummaries = [];
    const topicSummaries = submission.results.topic_summaries || {};
    matchedTopics.forEach((topic) => {
      if (topicSummaries[topic.name]) {
        validSummaries.push({
          topicName: topic.name,
          summary: topicSummaries[topic.name],
        });
      }
    });

    // 4. Summary Timeline Items — filter the items already built by the context
    const filteredTimelineItems = (allTimelineItems || []).filter((item) =>
      item.mapping?.source_sentences?.some((s) =>
        matchedSentence1BasedIndices.has(s),
      ),
    );

    // Recompute `showSectionLabel` because filtering might have removed the first item of a section
    let previousTopLevel = null;
    const finalTimelineItems = filteredTimelineItems.map((item) => {
      const showSection = Boolean(
        item.topLevelLabel && item.topLevelLabel !== previousTopLevel,
      );
      if (item.topLevelLabel) {
        previousTopLevel = item.topLevelLabel;
      }
      return { ...item, showSectionLabel: showSection };
    });

    return {
      sentencesInfo: matchedSentencesInfo,
      topics: matchedTopics,
      summaries: validSummaries,
      timelineItems: finalTimelineItems,
      allSentences: allSentences,
      allTopics: allTopics,
      treeEntries,
    };
  }, [submission, word, allTimelineItems, enrichedTopics]);

  /**
   * @param {string} key
   * @returns {void}
   */
  const handleTabClick = (key) => setActiveTab(key);

  /**
   * @param {WordPageTopic} topic
   * @returns {void}
   */
  const toggleTopic = useCallback((topic) => {
    setSelectedTopics((prev) => {
      const exists = prev.some((t) => t.name === topic.name);
      return exists
        ? prev.filter((t) => t.name !== topic.name)
        : [...prev, topic];
    });
  }, []);

  /**
   * @param {number} sentenceIndex
   * @param {string} tabKey
   * @returns {void}
   */
  const handleSentenceTabChange = useCallback((sentenceIndex, tabKey) => {
    setSentenceTabMap((prev) => ({ ...prev, [sentenceIndex]: tabKey }));
  }, []);

  const {
    sentencesInfo,
    topics,
    timelineItems,
    allSentences,
    allTopics,
    treeEntries,
  } = matchingData;

  const compareGroups = useMemo(() => {
    if (!submission?.results || sentencesInfo.length === 0) {
      return [];
    }

    return sentencesInfo.map((sentenceInfo, idx) => ({
      submission_id: submissionId,
      source_url: submission?.url || null,
      topic_name: `${word} (${idx + 1})`,
      sentences: [sentenceInfo.text],
      all_sentences: allSentences,
      topics: allTopics,
      indices: [sentenceInfo.index + 1],
    }));
  }, [submission, submissionId, word, sentencesInfo, allSentences, allTopics]);

  const readSentenceIndices = useMemo(() => {
    const indices = new Set();
    allTopics.forEach((topic) => {
      if (!readTopics.has(topic.name)) {
        return;
      }

      (topic.sentences || []).forEach((sentenceIndex) => {
        if (Number.isInteger(sentenceIndex)) {
          indices.add(sentenceIndex);
        }
      });
    });
    return indices;
  }, [allTopics, readTopics]);

  /**
   * Groups sentences by topic ranges. For each topic range that contains a matched
   * sentence, we display ALL sentences in that range (not just those containing
   * the word), mirroring how the backend generates markup in
   * lib/tasks/markup_generation.py::_extract_topic_ranges: use explicit
   * `ranges[]` with sentence_start/sentence_end when available, otherwise group
   * consecutive sentence numbers.
   *
   * We intentionally read from the raw `submission.results.topics` rather than
   * the `enrichedTopics` exposed by ArticleContext, because the enrichment step
   * (useTextPageData.safeTopics) rebuilds `ranges` from per-sentence
   * `sentence_spans`, collapsing every multi-sentence topic range into
   * single-sentence ranges. That loses the grouping we need here.
   */
  const sentenceGroupsByRange = useMemo(() => {
    const markup = submission?.results?.markup;
    const rawTopics = Array.isArray(submission?.results?.topics)
      ? submission.results.topics
      : [];

    const matchedTopicNames = new Set(topics.map((t) => t.name));
    const matchedSentenceNums = new Set(
      sentencesInfo.map(({ index }) => index + 1),
    );

    /**
     * Mirrors backend _extract_topic_ranges: prefer explicit ranges with
     * sentence_start/sentence_end, else group consecutive topic.sentences.
     * @param {{ ranges?: Array<{sentence_start?: number, sentence_end?: number}>, sentences?: number[] }} topic
     * @returns {Array<{ start: number, end: number }>}
     */
    const extractSentenceRanges = (topic) => {
      const rawRanges = Array.isArray(topic?.ranges) ? topic.ranges : [];
      const explicit = [];
      rawRanges.forEach((range) => {
        const s = Number(range?.sentence_start);
        const e = Number(range?.sentence_end ?? range?.sentence_start);
        if (Number.isInteger(s) && Number.isInteger(e) && s >= 1 && e >= s) {
          explicit.push({ start: s, end: e });
        }
      });
      if (explicit.length > 0) return explicit;

      const sorted = Array.isArray(topic?.sentences)
        ? [...topic.sentences]
            .filter((n) => Number.isInteger(n) && n >= 1)
            .sort((a, b) => a - b)
        : [];
      const groups = [];
      sorted.forEach((n) => {
        const last = groups[groups.length - 1];
        if (last && n === last[last.length - 1] + 1) {
          last.push(n);
        } else if (!last || n !== last[last.length - 1]) {
          groups.push([n]);
        }
      });
      return groups.map((g) => ({ start: g[0], end: g[g.length - 1] }));
    };

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordPattern = word ? new RegExp(`\\b${escapeRegex(word)}\\b`, "gi") : null;

    /** @type {Map<string, { topicName: string, rangeStart: number, rangeEnd: number }>} */
    const matchedRangeKeys = new Map();

    rawTopics.forEach((rawTopic) => {
      if (!rawTopic?.name || !matchedTopicNames.has(rawTopic.name)) return;
      const ranges = extractSentenceRanges(rawTopic);
      ranges.forEach(({ start, end }) => {
        let hit = false;
        for (let n = start; n <= end; n += 1) {
          if (matchedSentenceNums.has(n)) {
            hit = true;
            break;
          }
        }
        if (!hit) return;
        const key = `${rawTopic.name}\u0000${start}\u0000${end}`;
        if (!matchedRangeKeys.has(key)) {
          matchedRangeKeys.set(key, {
            topicName: rawTopic.name,
            rangeStart: start,
            rangeEnd: end,
          });
        }
      });
    });

    /** @type {Array<{ key: string, topic: any, rangeStart: number, rangeEnd: number, sentenceIndices: number[], text: string, sentences: string[], sentenceTopics: any[], wordHighlightRanges: Array<{start: number, end: number}>, hasMarkup: boolean }>} */
    const groups = [];

    matchedRangeKeys.forEach(({ topicName, rangeStart, rangeEnd }, key) => {
      const topic = topics.find((t) => t.name === topicName) || { name: topicName };

      const sentenceIndices = [];
      const sentences = [];
      for (let i = rangeStart; i <= rangeEnd; i += 1) {
        const sentIdx = i - 1;
        if (sentIdx >= 0 && sentIdx < allSentences.length) {
          sentenceIndices.push(sentIdx);
          sentences.push(allSentences[sentIdx]);
        }
      }
      if (sentences.length === 0) return;

      const combinedText = sentences.join(" ");
      const wordMatches = [];
      if (wordPattern) {
        wordPattern.lastIndex = 0;
        let match;
        while ((match = wordPattern.exec(combinedText)) !== null) {
          wordMatches.push({
            start: match.index,
            end: match.index + match[0].length,
          });
        }
      }

      groups.push({
        key,
        topic,
        rangeStart,
        rangeEnd,
        sentenceIndices,
        text: combinedText,
        sentences,
        sentenceTopics: [topic],
        wordHighlightRanges: wordMatches,
        hasMarkup: Boolean(markup && resolveTopicMarkup(markup, topic)),
      });
    });

    // Fallback: matched sentences not covered by any topic range
    sentencesInfo.forEach(({ index, text }) => {
      const sentNum = index + 1;
      const covered = groups.some(
        (g) => sentNum >= g.rangeStart && sentNum <= g.rangeEnd,
      );
      if (covered) return;

      const wordMatches = [];
      if (wordPattern) {
        wordPattern.lastIndex = 0;
        let match;
        while ((match = wordPattern.exec(text)) !== null) {
          wordMatches.push({
            start: match.index,
            end: match.index + match[0].length,
          });
        }
      }
      groups.push({
        key: `standalone\u0000${sentNum}`,
        topic: { name: `Sentence ${sentNum}` },
        rangeStart: sentNum,
        rangeEnd: sentNum,
        sentenceIndices: [index],
        text,
        sentences: [text],
        sentenceTopics: [],
        wordHighlightRanges: wordMatches,
        hasMarkup: false,
      });
    });

    groups.sort((a, b) => a.rangeStart - b.rangeStart);
    return groups;
  }, [sentencesInfo, submission, topics, word, allSentences]);

  const markup = submission?.results?.markup;

  const treeEntriesWithReadState = useMemo(() => {
    return treeEntries.map((entry) => ({
      ...entry,
      isRead: readSentenceIndices.has(entry.sentenceNumber),
    }));
  }, [treeEntries, readSentenceIndices]);

  /**
   * @param {{ source_sentences?: number[]; summary_sentence?: string }} mapping
   * @param {{ sentences: string[] }} article
   * @param {string | null | undefined} topicName
   * @returns {void}
   */
  const handleSummaryClick = useCallback((mapping, article, topicName) => {
    if (mapping && mapping.source_sentences) {
      setSummaryModalTopic(
        buildModalSelectionFromSummarySource({
          topicName,
          sentenceIndices: mapping.source_sentences,
          summarySentence: mapping.summary_sentence,
          sentences: article.sentences,
        }),
      );
    }
  }, []);

  const handleShowInArticle = useCallback(
    (modalTopic) => {
      const normalizedSelection = buildTopicModalSelection(
        modalTopic,
        allTopics,
      );
      const primaryTopicName = normalizedSelection?.primaryTopicName;
      if (!primaryTopicName) {
        return;
      }

      navigate(
        `/page/text/${submissionId}?topic=${encodeURIComponent(primaryTopicName)}`,
      );
    },
    [allTopics, submissionId],
  );

  const articles = useMemo(
    () => [
      {
        sentences: allSentences,
        topics: allTopics,
        topic_summaries: submission?.results?.topic_summaries || {},
      },
    ],
    [allSentences, allTopics, submission],
  );

  if (loading)
    return <div className="word-page-loading">Loading word data...</div>;
  if (error) return <div className="word-page-error">Error: {error}</div>;
  if (!submission)
    return <div className="word-page-no-submission">No submission found.</div>;

  return (
    <div
      className={`page-stack word-page${activeTab === "compare" ? " word-page--compare-active" : ""}`}
    >
      <div className="word-page-header">
        <div className="word-page-header-row">
          <button
            type="button"
            onClick={() => navigate(`/page/text/${submissionId}`)}
            className="action-btn"
          >
            ← Back to Article
          </button>
          <h2 className="word-page-title">
            Sentences matching:{" "}
            <span className="word-page-word-highlight">"{word}"</span>
          </h2>
          {activeTab === "sentences" && (
            <div className="word-page-controls">
              <label className="grouped-topics-toggle word-page-toggle">
                <input
                  type="checkbox"
                  checked={tooltipEnabled}
                  onChange={() => setTooltipEnabled((prev) => !prev)}
                />
                Show tooltips
              </label>
              <label className="grouped-topics-toggle word-page-toggle">
                <input
                  type="checkbox"
                  checked={summaryKeywordHighlightEnabled}
                  onChange={() =>
                    setSummaryKeywordHighlightEnabled((prev) => !prev)
                  }
                />
                Highlight summary keywords
              </label>
              <div className="word-page-context-analysis">
                {!wordContextStatus ? (
                  <button
                    type="button"
                    className="action-btn word-page-context-btn"
                    onClick={startWordContextAnalysis}
                  >
                    Analyze word context
                  </button>
                ) : wordContextStatus.status === "pending" ? (
                  <div className="word-page-context-progress">
                    <span className="word-page-context-progress-label">
                      Analyzing topics… {wordContextStatus.completed}/
                      {wordContextStatus.total || "?"}
                    </span>
                    <div className="word-page-progress-bar">
                      <div
                        className="word-page-progress-fill"
                        style={{
                          width:
                            wordContextStatus.total > 0
                              ? `${Math.round((wordContextStatus.completed / wordContextStatus.total) * 100)}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <label className="grouped-topics-toggle word-page-toggle">
                    <input
                      type="checkbox"
                      checked={wordContextHighlightsEnabled}
                      onChange={() =>
                        setWordContextHighlightsEnabled((prev) => !prev)
                      }
                    />
                    Word-context highlights
                  </label>
                )}
              </div>
            </div>
          )}
          <div className="tab-bar word-page-tab-bar">
            <div className="tabs">
              {VIS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={activeTab === tab.key ? "active" : ""}
                  onClick={() => handleTabClick(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container word-page-container">
        <div className="word-page-content">
          {activeTab === "sentences" && (
            <div>
              {sentencesInfo.length === 0 ? (
                <div className="word-page-no-occurrences">
                  <p>No occurrences of "{word}" were found in the article.</p>
                  {similarWords.length > 0 && (
                    <div className="word-page-similar-words">
                      <h3>You might be looking for:</h3>
                      <div className="word-page-similar-words-list">
                        {similarWords.map((w) => (
                          <button
                            key={w}
                            className="similar-word-link"
                            onClick={() =>
                              navigate(
                                `/page/word/${submissionId}/${encodeURIComponent(w)}`,
                              )
                            }
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="word-page-sentences-list">
                  {sentenceGroupsByRange.map(
                    ({
                      key,
                      topic,
                      rangeStart: _rangeStart,
                      rangeEnd: _rangeEnd,
                      sentenceIndices,
                      text,
                      sentences,
                      sentenceTopics,
                      wordHighlightRanges,
                      hasMarkup,
                    }) => {
                      const rangeMarkupRanges = hasMarkup
                        ? getTopicMarkupRanges(
                            resolveTopicMarkup(markup, topic),
                          )
                        : [];
                      const activeSentenceTab =
                        sentenceTabMap[key] || "sentences";
                      const sentenceLabel =
                        sentenceIndices.length === 1
                          ? `Sentence #${sentenceIndices[0] + 1}`
                          : `Sentences #${sentenceIndices[0] + 1}-${sentenceIndices[sentenceIndices.length - 1] + 1}`;
                      return (
                        <div
                          key={key}
                          className="word-page-sentence-card word-page-sentence-card--grouped"
                        >
                          <div className="word-page-sentence-header">
                            <span className="word-page-sentence-topic-label">
                              {topic.name}
                            </span>
                            <span className="word-page-sentence-range-label">
                              {sentenceLabel}
                            </span>
                            <div className="word-page-sentence-tabs">
                              <button
                                type="button"
                                className={`word-page-sentence-tab${activeSentenceTab === "sentences" ? " word-page-sentence-tab--active" : ""}`}
                                onClick={() =>
                                  handleSentenceTabChange(key, "sentences")
                                }
                              >
                                Sentences
                              </button>
                              <button
                                type="button"
                                className={`word-page-sentence-tab${activeSentenceTab === "markup" ? " word-page-sentence-tab--active" : ""}${!hasMarkup ? " word-page-sentence-tab--disabled" : ""}`}
                                onClick={() =>
                                  hasMarkup &&
                                  handleSentenceTabChange(key, "markup")
                                }
                                disabled={!hasMarkup}
                              >
                                Markup
                              </button>
                            </div>
                          </div>
                          {activeSentenceTab === "markup" &&
                          hasMarkup &&
                          rangeMarkupRanges.length > 0 ? (
                            <div className="word-page-sentence-markup">
                              {rangeMarkupRanges.map((range) => (
                                <MarkupRenderer
                                  key={`range-${range.range_index ?? 0}-${range.sentence_start}-${range.sentence_end}`}
                                  html={range.html}
                                  highlightWords={[word]}
                                />
                              ))}
                            </div>
                          ) : (
                            <TextDisplay
                              sentences={sentences}
                              selectedTopics={selectedTopics}
                              hoveredTopic={hoveredTopic}
                              readTopics={readTopics}
                              articleTopics={sentenceTopics}
                              articleIndex={0}
                              onToggleRead={toggleRead}
                              onToggleTopic={toggleTopic}
                              tooltipEnabled={tooltipEnabled}
                              submissionId={submissionId}
                              highlightWords={[word]}
                              rawText={text}
                              summaryHighlightRanges={wordHighlightRanges}
                            />
                          )}
                        </div>
                      );
                    },
                  )}
                  {similarWords.length > 0 && (
                    <div className="word-page-similar-words">
                      <h3>Other related words:</h3>
                      <div className="word-page-similar-words-list">
                        {similarWords.map((w) => (
                          <button
                            key={w}
                            className="similar-word-link"
                            onClick={() =>
                              navigate(
                                `/page/word/${submissionId}/${encodeURIComponent(w)}`,
                              )
                            }
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "compare" && (
            <div className="word-page-compare-container">
              {compareGroups.length > 0 ? (
                <GlobalTopicsCompareView
                  groups={compareGroups}
                  groupRefs={compareGroupRefs}
                  highlightWord={word}
                />
              ) : (
                <p className="word-page-no-occurrences">
                  No occurrences of this word were found in the article.
                </p>
              )}
            </div>
          )}

          {activeTab === "tree" && (
            <div className="word-page-tree-container">
              <WordTree entries={treeEntriesWithReadState} pivotLabel={word} />
            </div>
          )}

          {activeTab === "circles" && (
            <div className="word-page-chart-container">
              <CircularPackingChart
                topics={topics}
                sentences={allSentences}
                onShowInArticle={handleShowInArticle}
                readTopics={readTopics}
                onToggleRead={toggleRead}
                markup={submission?.results?.markup}
              />
            </div>
          )}

          {activeTab === "treemap" && (
            <div className="word-page-chart-container">
              <TreemapChart
                topics={topics}
                sentences={allSentences}
                onShowInArticle={handleShowInArticle}
                readTopics={readTopics}
                onToggleRead={toggleRead}
                markup={submission?.results?.markup}
              />
            </div>
          )}

          {activeTab === "summaries" && (
            <div className="word-page-timeline-container">
              <SummaryTimeline
                mode="summary"
                title="Topic Summaries"
                summaryTimelineItems={timelineItems}
                highlightedSummaryParas={new Set()}
                summaryModalTopic={null}
                closeSummaryModal={() => setSummaryModalTopic(null)}
                handleSummaryClick={handleSummaryClick}
                articles={articles}
                topics={allTopics}
                onClose={() => setActiveTab("sentences")}
                onShowInArticle={handleShowInArticle}
                readTopics={readTopics}
                onToggleRead={toggleRead}
                markup={submission?.results?.markup}
              />
            </div>
          )}

          {activeTab === "tags" && (
            <div>
              <h3>Tags Cloud for sentences containing "{word}"</h3>
              <TopicsTagCloud
                submissionId={submissionId}
                topics={[]}
                sentences={allSentences}
                forcedPathQuery={`word=${encodeURIComponent(word)}`}
                readTopics={readTopics}
                onToggleRead={toggleRead}
                markup={submission?.results?.markup}
                onShowInArticle={handleShowInArticle}
              />
            </div>
          )}
        </div>
      </div>

      {summaryModalTopic && (
        <TopicSentencesModal
          topic={summaryModalTopic}
          sentences={summaryModalTopic._sentences || allSentences}
          onClose={() => setSummaryModalTopic(null)}
          onShowInArticle={handleShowInArticle}
          allTopics={allTopics}
          readTopics={readTopics}
          onToggleRead={toggleRead}
          markup={submission?.results?.markup}
        />
      )}
    </div>
  );
}
