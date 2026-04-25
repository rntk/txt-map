import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TopicSentencesModal.css";
import ArticleMinimap from "../grid/ArticleMinimap";
import MarkupRenderer from "../markup/MarkupRenderer";
import {
  getTopicMarkupRanges,
  resolveTopicMarkup,
} from "../markup/topicMarkupUtils";
import { getTopicHighlightColor } from "../../utils/topicColorUtils";
import { isTopicSelectionRead } from "../../utils/topicReadUtils";
import { buildTopicModalSelection } from "../../utils/topicModalSelection";
import { HighlightContext } from "./HighlightContext";
import HighlightedText from "./HighlightedText";
import { useArticle } from "../../contexts/ArticleContext";

const EXTEND_COUNT = 3;

/**
 * @typedef {Object} TopicSentencesModalTopic
 * @property {string} [name]
 * @property {string} [fullPath]
 * @property {string} [displayName]
 * @property {number[] | Set<number>} [sentenceIndices]
 * @property {Array<unknown>} [ranges]
 * @property {string[]} [_sentences]
 * @property {string} [_summarySentence]
 *
 * @typedef {Object} TopicSentencesModalProps
 * @property {TopicSentencesModalTopic | null | undefined} topic
 * @property {string[] | null | undefined} sentences
 * @property {() => void} onClose
 * @property {React.ReactNode} [headerExtra]
 * @property {(topic: TopicSentencesModalTopic) => void} [onShowInArticle]
 * @property {Record<string, unknown>} [markup]
 * @property {Array<unknown>} [allTopics]
 * @property {Set<string> | Iterable<string>} [readTopics]
 * @property {(topic: TopicSentencesModalTopic) => void} [onToggleRead]
 */

function groupConsecutive(sortedIndices) {
  if (sortedIndices.length === 0) return [];
  const groups = [];
  let currentGroup = [sortedIndices[0]];
  for (let i = 1; i < sortedIndices.length; i++) {
    if (sortedIndices[i] - sortedIndices[i - 1] <= 1) {
      currentGroup.push(sortedIndices[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sortedIndices[i]];
    }
  }
  groups.push(currentGroup);
  return groups;
}

function formatSentenceSpan(firstIndex, lastIndex) {
  if (!Number.isInteger(firstIndex) || !Number.isInteger(lastIndex)) {
    return "Source range";
  }
  if (firstIndex === lastIndex) {
    return `Sentence ${firstIndex}`;
  }
  return `Sentences ${firstIndex}-${lastIndex}`;
}

/**
 * @param {TopicSentencesModalTopic | null | undefined} topic
 * @returns {TopicSentencesModalTopic | null}
 */
function normalizeTopic(topic, allTopics) {
  return buildTopicModalSelection(topic, allTopics);
}

/**
 * @param {TopicSentencesModalProps} props
 * @returns {React.ReactElement | null}
 */
function TopicSentencesModal({
  topic,
  sentences: sentencesProp,
  onClose,
  headerExtra,
  onShowInArticle,
  markup: markupProp,
  allTopics: allTopicsProp,
  readTopics: readTopicsProp,
  onToggleRead: onToggleReadProp,
}) {
  const article = useArticle();
  const sentences = useMemo(() => {
    const candidate = sentencesProp ?? article?.sentences;
    return Array.isArray(candidate) ? candidate : [];
  }, [article?.sentences, sentencesProp]);
  const markup = markupProp ?? article?.markup;
  const allTopics = allTopicsProp ?? article?.topics ?? [];
  const readTopics = readTopicsProp ?? article?.readTopics ?? new Set();
  const onToggleRead = onToggleReadProp ?? article?.toggleRead;
  const globalTopicSummaries = useMemo(() => {
    const candidate = article?.topicSummaries;
    return candidate && typeof candidate === "object" ? candidate : {};
  }, [article?.topicSummaries]);
  const [extendedIndices, setExtendedIndices] = useState(new Set());
  const [activeTab, setActiveTab] = useState("sentences");
  const [pendingScrollIndex, setPendingScrollIndex] = useState(null);
  const sentenceRowRefs = useRef({});
  const minimapPaneRef = useRef(null);
  const normalizedTopic = normalizeTopic(topic, allTopics);

  const summarySentence = useMemo(() => {
    if (normalizedTopic?._summarySentence) {
      return normalizedTopic._summarySentence;
    }
    if (normalizedTopic?.name && globalTopicSummaries[normalizedTopic.name]) {
      return globalTopicSummaries[normalizedTopic.name];
    }
    return null;
  }, [normalizedTopic, globalTopicSummaries]);

  const modalSentences = useMemo(() => {
    if (Array.isArray(normalizedTopic?._sentences)) {
      return normalizedTopic._sentences;
    }

    return Array.isArray(sentences) ? sentences : [];
  }, [normalizedTopic?._sentences, sentences]);

  const highlightWords = useMemo(() => {
    if (!normalizedTopic?.displayName) return [];
    // Split by whitespace and remove leading/trailing non-alphanumeric characters from each word
    const topicWords = normalizedTopic.displayName
      .split(/\s+/)
      .map((w) => w.replace(/^[\W_]+|[\W_]+$/g, ""))
      .filter((word) => word.length > 0);

    // Also extract words from summary sentence if available
    if (summarySentence) {
      const summaryWords = summarySentence
        .split(/\s+/)
        .map((w) => w.replace(/^[\W_]+|[\W_]+$/g, ""))
        .filter((word) => word.length > 0);
      // Combine topic words and summary words, removing duplicates
      const allWords = new Set([...topicWords, ...summaryWords]);
      return Array.from(allWords);
    }

    return topicWords;
  }, [normalizedTopic?.displayName, summarySentence]);

  const isRead = normalizedTopic
    ? isTopicSelectionRead(normalizedTopic, readTopics)
    : false;
  const indicesList = normalizedTopic?.sentenceIndices || [];
  const topicMarkup = resolveTopicMarkup(markup, normalizedTopic);
  const markupRanges = getTopicMarkupRanges(topicMarkup);
  const hasEnrichedMarkup = markupRanges.length > 0;
  const canToggleRead =
    Boolean(onToggleRead) &&
    Array.isArray(normalizedTopic?.canonicalTopicNames) &&
    normalizedTopic.canonicalTopicNames.length > 0;
  const canShowInArticle =
    Boolean(onShowInArticle) &&
    typeof normalizedTopic?.primaryTopicName === "string" &&
    normalizedTopic.primaryTopicName.trim().length > 0;

  useEffect(() => {
    setExtendedIndices(new Set());
    setActiveTab(hasEnrichedMarkup ? "enriched" : "sentences");
    setPendingScrollIndex(null);
    sentenceRowRefs.current = {};
  }, [normalizedTopic?.name, hasEnrichedMarkup]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const sortedBase = [...indicesList].sort((a, b) => a - b);
  const allIndices = [...new Set([...sortedBase, ...extendedIndices])].sort(
    (a, b) => a - b,
  );
  const rangeGroups = groupConsecutive(allIndices);
  const totalSentences = modalSentences.length;
  const topicSentenceIndexSet = useMemo(
    () => new Set(sortedBase.filter((value) => Number.isInteger(value))),
    [sortedBase],
  );
  const articleMinimapSentenceStates = useMemo(() => {
    if (!Array.isArray(modalSentences) || modalSentences.length === 0) {
      return [];
    }

    const topicColor = normalizedTopic?.name
      ? getTopicHighlightColor(normalizedTopic.name)
      : "rgba(31, 32, 29, 0.85)";

    return modalSentences.map((_, index) => {
      const sentenceIndex = index + 1;
      if (topicSentenceIndexSet.has(sentenceIndex)) {
        return { isActive: true, color: topicColor };
      }
      if (extendedIndices.has(sentenceIndex)) {
        return { isActive: true, color: "rgba(148, 163, 184, 0.72)" };
      }
      return null;
    });
  }, [
    extendedIndices,
    modalSentences,
    normalizedTopic?.name,
    topicSentenceIndexSet,
  ]);

  const extendBefore = (firstIdx) => {
    const newSet = new Set(extendedIndices);
    for (let i = 1; i <= EXTEND_COUNT; i++) {
      const newIdx = firstIdx - i;
      if (newIdx >= 1) newSet.add(newIdx);
    }
    setExtendedIndices(newSet);
  };

  const extendAfter = (lastIdx) => {
    const newSet = new Set(extendedIndices);
    for (let i = 1; i <= EXTEND_COUNT; i++) {
      const newIdx = lastIdx + i;
      if (newIdx <= totalSentences) newSet.add(newIdx);
    }
    setExtendedIndices(newSet);
  };

  const scrollSentenceIntoView = (sentenceIndex) => {
    if (!Number.isInteger(sentenceIndex)) {
      return;
    }
    const targetRow = sentenceRowRefs.current[sentenceIndex];
    if (targetRow instanceof HTMLElement) {
      targetRow.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const revealSentenceContext = (sentenceIndex) => {
    if (
      !Number.isInteger(sentenceIndex) ||
      sentenceIndex < 1 ||
      sentenceIndex > totalSentences
    ) {
      return;
    }
    const nextExtendedIndices = new Set(extendedIndices);
    for (let offset = -EXTEND_COUNT; offset <= EXTEND_COUNT; offset += 1) {
      const nextIndex = sentenceIndex + offset;
      if (
        nextIndex >= 1 &&
        nextIndex <= totalSentences &&
        !topicSentenceIndexSet.has(nextIndex)
      ) {
        nextExtendedIndices.add(nextIndex);
      }
    }
    setExtendedIndices(nextExtendedIndices);
  };

  const handleMinimapSentenceClick = (sentenceIndex) => {
    setActiveTab("sentences");
    setPendingScrollIndex(sentenceIndex);
    if (!allIndices.includes(sentenceIndex)) {
      revealSentenceContext(sentenceIndex);
      return;
    }
    scrollSentenceIntoView(sentenceIndex);
  };

  useEffect(() => {
    if (activeTab !== "sentences" || !Number.isInteger(pendingScrollIndex)) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollSentenceIntoView(pendingScrollIndex);
      setPendingScrollIndex(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab, allIndices, pendingScrollIndex]);

  useEffect(() => {
    const firstTopicSentenceIndex = sortedBase.find(
      (value) => Number.isInteger(value) && value > 0,
    );
    if (!Number.isInteger(firstTopicSentenceIndex)) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const minimapPane = minimapPaneRef.current;
      if (!(minimapPane instanceof HTMLElement)) {
        return;
      }

      const minimapButton = minimapPane.querySelector(
        `[aria-label="Scroll to sentence ${firstTopicSentenceIndex}"]`,
      );
      if (minimapButton instanceof HTMLElement) {
        minimapButton.scrollIntoView({ block: "center", behavior: "auto" });
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [sortedBase, normalizedTopic?.name]);

  if (!normalizedTopic) return null;

  const hasSummary = Boolean(summarySentence);

  const tabs = [
    { key: "sentences", label: "Sentences" },
    { key: "summary", label: "Summary", disabled: !hasSummary },
    { key: "enriched", label: "Enriched", disabled: !hasEnrichedMarkup },
    { key: "raw", label: "Raw JSON", disabled: !hasEnrichedMarkup },
  ];

  return (
    <div className="topic-sentences-modal__overlay" onClick={onClose}>
      <div
        className="topic-sentences-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="topic-sentences-modal__header">
          <h3>{normalizedTopic.displayName}</h3>
          <div className="topic-sentences-modal__header-actions">
            {canToggleRead && (
              <button
                type="button"
                className={`topic-sentences-modal__read-btn${isRead ? " topic-sentences-modal__read-btn--active" : ""}`}
                onClick={() => {
                  const ranges = normalizedTopic.ranges;
                  if (Array.isArray(ranges) && ranges.length > 1 && !isRead) {
                    const ok = window.confirm(
                      `"${normalizedTopic.name}" has ${ranges.length} separate ranges. Some may not be visible on screen. Mark as read?`,
                    );
                    if (!ok) return;
                  }
                  onToggleRead(normalizedTopic);
                }}
                title={isRead ? "Mark topic as unread" : "Mark topic as read"}
              >
                {isRead ? "Mark unread" : "Mark as read"}
              </button>
            )}
            {canShowInArticle && (
              <button
                type="button"
                className="topic-sentences-modal__show-in-article"
                onClick={() => {
                  onShowInArticle(normalizedTopic);
                  onClose();
                }}
                title="Close this panel and jump to the topic in the article"
              >
                Show in article
              </button>
            )}
            <button
              type="button"
              className="topic-sentences-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="topic-sentences-modal__tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`topic-sentences-modal__tab${activeTab === tab.key ? " topic-sentences-modal__tab--active" : ""}${tab.disabled ? " topic-sentences-modal__tab--disabled" : ""}`}
              onClick={() => !tab.disabled && setActiveTab(tab.key)}
              disabled={tab.disabled}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {headerExtra && (
          <div className="topic-sentences-modal__header-extra">
            {headerExtra}
          </div>
        )}
        <div className="topic-sentences-modal__body">
          <div className="topic-sentences-modal__content-pane">
            <HighlightContext.Provider value={highlightWords}>
              {activeTab === "summary" && hasSummary ? (
                <div className="topic-sentences-modal__summary-pane">
                  <p>{summarySentence}</p>
                </div>
              ) : activeTab === "enriched" && hasEnrichedMarkup ? (
                <div className="topic-sentences-modal__enriched-groups">
                  {markupRanges.map((range) => (
                    <section
                      key={`${range.range_index ?? 0}-${range.sentence_start}-${range.sentence_end}`}
                      className="topic-sentences-modal__enriched-range"
                    >
                      <header className="topic-sentences-modal__enriched-range-header">
                        <span className="topic-sentences-modal__enriched-range-badge">
                          Range {range.range_index ?? 1}
                        </span>
                        <span className="topic-sentences-modal__enriched-range-title">
                          {formatSentenceSpan(
                            range.sentence_start,
                            range.sentence_end,
                          )}
                        </span>
                      </header>
                      <div className="topic-sentences-modal__enriched-range-body">
                        <MarkupRenderer
                          html={range.html}
                          highlightWords={highlightWords}
                        />
                      </div>
                    </section>
                  ))}
                </div>
              ) : activeTab === "raw" && hasEnrichedMarkup ? (
                <pre className="topic-sentences-modal__raw-json">
                  {JSON.stringify(topicMarkup, null, 2)}
                </pre>
              ) : allIndices.length === 0 ? (
                <p className="topic-sentences-modal__empty">
                  No sentences found for this topic.
                </p>
              ) : (
                rangeGroups.map((group, groupIdx) => {
                  const firstIdx = group[0];
                  const lastIdx = group[group.length - 1];
                  const canExtendBefore = firstIdx > 1;
                  const canExtendAfter = lastIdx < totalSentences;
                  return (
                    <div
                      key={groupIdx}
                      className="topic-sentences-modal__range-group"
                    >
                      {canExtendBefore && (
                        <button
                          type="button"
                          className="topic-sentences-modal__extend-btn"
                          onClick={() => extendBefore(firstIdx)}
                        >
                          ↑ Extend before
                        </button>
                      )}
                      {group.map((idx, sentencePos) => {
                        const isExtended = extendedIndices.has(idx);
                        const isFirst = sentencePos === 0;
                        return (
                          <div
                            key={idx}
                            ref={(element) => {
                              if (element) {
                                sentenceRowRefs.current[idx] = element;
                              } else {
                                delete sentenceRowRefs.current[idx];
                              }
                            }}
                            className={`topic-sentences-modal__sentence${isFirst ? " topic-sentences-modal__sentence--first" : ""}${isExtended ? " topic-sentences-modal__sentence--extended" : ""}`}
                          >
                            <span className="topic-sentences-modal__sentence-num">
                              {idx}.
                            </span>
                            <span className="topic-sentences-modal__sentence-text">
                              <HighlightedText
                                text={
                                  modalSentences[idx - 1]
                                    ? modalSentences[idx - 1]
                                    : ""
                                }
                              />
                            </span>
                          </div>
                        );
                      })}
                      {canExtendAfter && (
                        <button
                          type="button"
                          className="topic-sentences-modal__extend-btn"
                          onClick={() => extendAfter(lastIdx)}
                        >
                          ↓ Extend after
                        </button>
                      )}
                      {groupIdx < rangeGroups.length - 1 && (
                        <div className="topic-sentences-modal__range-separator" />
                      )}
                    </div>
                  );
                })
              )}
            </HighlightContext.Provider>
          </div>
          <aside
            ref={minimapPaneRef}
            className="topic-sentences-modal__minimap-pane"
            aria-label="Topic article minimap"
          >
            <div className="topic-sentences-modal__minimap-header">
              <div className="topic-sentences-modal__minimap-title">
                Article Minimap
              </div>
              <div className="topic-sentences-modal__minimap-subtitle">
                {topicSentenceIndexSet.size} topic sentences
              </div>
            </div>
            <ArticleMinimap
              sentences={modalSentences}
              sentenceStates={articleMinimapSentenceStates}
              onSentenceClick={handleMinimapSentenceClick}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

export default TopicSentencesModal;
