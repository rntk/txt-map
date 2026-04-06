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
  const compareGroupRefs = useRef({});

  const [similarWords, setSimilarWords] = useState([]);

  useEffect(() => {
    if (word) {
      getSimilarWords(word).then(setSimilarWords);
    }
  }, [word, getSimilarWords]);
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
    const allTopics = submission.results.topics || [];
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
  }, [submission, word, allTimelineItems]);

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
            <label className="grouped-topics-toggle word-page-tooltip-toggle">
              <input
                type="checkbox"
                checked={tooltipEnabled}
                onChange={() => setTooltipEnabled((prev) => !prev)}
              />
              Show tooltips
            </label>
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
                  {sentencesInfo.map(({ index, text }) => (
                    <div key={index} className="word-page-sentence-card">
                      <div className="word-page-sentence-header">
                        <span>Sentence #{index + 1}</span>
                      </div>
                      <TextDisplay
                        sentences={[text]}
                        selectedTopics={selectedTopics}
                        hoveredTopic={hoveredTopic}
                        readTopics={readTopics}
                        articleTopics={topics
                          .filter((t) => t.sentences.includes(index + 1))
                          .map((t) => ({ ...t, sentences: [1] }))}
                        articleIndex={0}
                        onToggleRead={toggleRead}
                        onToggleTopic={toggleTopic}
                        tooltipEnabled={tooltipEnabled}
                        submissionId={submissionId}
                        highlightWords={[word]}
                      />
                    </div>
                  ))}
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
