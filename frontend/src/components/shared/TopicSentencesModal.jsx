import React, { useEffect, useState, useMemo } from 'react';
import './TopicSentencesModal.css';
import MarkupRenderer from '../markup/MarkupRenderer';
import {
    buildEnrichedRangeGroupsWithFallbacks,
    buildGroupMarkup,
    resolveTopicMarkup,
} from '../markup/topicMarkupUtils';
import { HighlightContext } from './HighlightContext';
import HighlightedText from './HighlightedText';

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
        return 'Source range';
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
function normalizeTopic(topic) {
    if (!topic) {
        return null;
    }

    const trimmedName = typeof topic.name === 'string' ? topic.name.trim() : '';
    const trimmedFullPath = typeof topic.fullPath === 'string' ? topic.fullPath.trim() : '';
    const trimmedDisplayName = typeof topic.displayName === 'string' ? topic.displayName.trim() : '';
    const canonicalName = trimmedName || trimmedFullPath || trimmedDisplayName;
    const sentenceIndexSource = topic.sentenceIndices ?? topic.sentences;
    const normalizedSentenceIndices = Array.isArray(sentenceIndexSource)
        ? sentenceIndexSource
        : (sentenceIndexSource instanceof Set ? Array.from(sentenceIndexSource) : []);

    if (!canonicalName) {
        return {
            ...topic,
            displayName: trimmedDisplayName,
            sentenceIndices: normalizedSentenceIndices,
        };
    }

    return {
        ...topic,
        name: canonicalName,
        fullPath: trimmedFullPath || canonicalName,
        displayName: trimmedDisplayName || canonicalName,
        sentenceIndices: normalizedSentenceIndices,
    };
}

function TopicSentencesModal({
    topic,
    sentences,
    onClose,
    headerExtra,
    onShowInArticle,
    markup,
    readTopics = new Set(),
    onToggleRead,
}) {
    const [extendedIndices, setExtendedIndices] = useState(new Set());
    const [activeTab, setActiveTab] = useState('sentences');
    const normalizedTopic = normalizeTopic(topic);

    const highlightWords = useMemo(() => {
        if (!normalizedTopic?.displayName) return [];
        // Split by whitespace and remove leading/trailing non-alphanumeric characters from each word
        return normalizedTopic.displayName
            .split(/\s+/)
            .map((w) => w.replace(/^[\W_]+|[\W_]+$/g, ''))
            .filter((word) => word.length > 0);
    }, [normalizedTopic?.displayName]);

    const isRead = normalizedTopic && readTopics instanceof Set
        ? readTopics.has(normalizedTopic.name)
        : false;
    const topicMarkup = resolveTopicMarkup(markup, normalizedTopic);
    const hasEnrichedMarkup = Boolean(
        topicMarkup
        && Array.isArray(topicMarkup.segments)
        && topicMarkup.segments.some(segment => segment?.type !== 'plain')
    );
    const enrichedRangeGroups = hasEnrichedMarkup
        ? buildEnrichedRangeGroupsWithFallbacks(
            Array.isArray(topicMarkup?.positions) ? topicMarkup.positions : [],
            normalizedTopic?.sentenceIndices || [],
            Array.isArray(normalizedTopic?.ranges) ? normalizedTopic.ranges : []
        )
        : [];
    const markupUnits = Array.isArray(topicMarkup?.positions)
        ? topicMarkup.positions.map((position) => position.text || '')
        : sentences;

    useEffect(() => {
        setExtendedIndices(new Set());
        setActiveTab(hasEnrichedMarkup ? 'enriched' : 'sentences');
    }, [normalizedTopic?.name, hasEnrichedMarkup]);

    useEffect(() => {
        const handleKey = e => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    if (!normalizedTopic) return null;

    const indicesList = normalizedTopic.sentenceIndices || [];

    const sortedBase = [...indicesList].sort((a, b) => a - b);
    const allIndices = [...new Set([...sortedBase, ...extendedIndices])].sort((a, b) => a - b);
    const rangeGroups = groupConsecutive(allIndices);
    const totalSentences = sentences ? sentences.length : 0;

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

    const tabs = [
        { key: 'sentences', label: 'Sentences' },
        { key: 'enriched', label: 'Enriched', disabled: !hasEnrichedMarkup },
        { key: 'raw', label: 'Raw JSON', disabled: !hasEnrichedMarkup },
    ];

    return (
        <div className="topic-sentences-modal__overlay" onClick={onClose}>
            <div
                className="topic-sentences-modal"
                onClick={e => e.stopPropagation()}
            >
                <div className="topic-sentences-modal__header">
                    <h3>{normalizedTopic.displayName}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {onToggleRead && (
                            <button
                                type="button"
                                className={`topic-sentences-modal__read-btn${isRead ? ' topic-sentences-modal__read-btn--active' : ''}`}
                                onClick={() => {
                                    const ranges = normalizedTopic.ranges;
                                    if (Array.isArray(ranges) && ranges.length > 1 && !isRead) {
                                        const ok = window.confirm(
                                            `"${normalizedTopic.name}" has ${ranges.length} separate ranges. Some may not be visible on screen. Mark as read?`
                                        );
                                        if (!ok) return;
                                    }
                                    onToggleRead(normalizedTopic);
                                }}
                                title={isRead ? 'Mark topic as unread' : 'Mark topic as read'}
                            >
                                {isRead ? 'Mark unread' : 'Mark as read'}
                            </button>
                        )}
                        {onShowInArticle && (
                            <button
                                type="button"
                                className="topic-sentences-modal__show-in-article"
                                onClick={() => { onShowInArticle(normalizedTopic); onClose(); }}
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
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            className={`topic-sentences-modal__tab${activeTab === tab.key ? ' topic-sentences-modal__tab--active' : ''}${tab.disabled ? ' topic-sentences-modal__tab--disabled' : ''}`}
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
                    <HighlightContext.Provider value={highlightWords}>
                        {activeTab === 'enriched' && hasEnrichedMarkup ? (
                            <div className="topic-sentences-modal__enriched-groups">
                                {(enrichedRangeGroups.length > 0 ? enrichedRangeGroups : [{
                                    groupNumber: 1,
                                    firstSourceSentenceIndex: 1,
                                    lastSourceSentenceIndex: markupUnits.length,
                                    positions: Array.isArray(topicMarkup?.positions) ? topicMarkup.positions : [],
                                }]).map((rangeGroup) => {
                                    const groupMarkup = buildGroupMarkup(topicMarkup, rangeGroup);
                                    const groupMarkupUnits = groupMarkup.positions.map((position) => position.text || '');
                                    return (
                                        <section
                                            key={`${rangeGroup.groupNumber}-${rangeGroup.firstSourceSentenceIndex}-${rangeGroup.lastSourceSentenceIndex}`}
                                            className="topic-sentences-modal__enriched-range"
                                        >
                                            <header className="topic-sentences-modal__enriched-range-header">
                                                <span className="topic-sentences-modal__enriched-range-badge">
                                                    Range {rangeGroup.groupNumber}
                                                </span>
                                                <span className="topic-sentences-modal__enriched-range-title">
                                                    {formatSentenceSpan(
                                                        rangeGroup.firstSourceSentenceIndex,
                                                        rangeGroup.lastSourceSentenceIndex
                                                    )}
                                                </span>
                                            </header>
                                            <div className="topic-sentences-modal__enriched-range-body">
                                                <MarkupRenderer
                                                    segments={groupMarkup.segments}
                                                    sentences={groupMarkupUnits}
                                                />
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>
                        ) : activeTab === 'raw' && hasEnrichedMarkup ? (
                            <pre className="topic-sentences-modal__raw-json">
                                {JSON.stringify(topicMarkup, null, 2)}
                            </pre>
                        ) : allIndices.length === 0 ? (
                            <p>No sentences found for this topic.</p>
                        ) : (
                            rangeGroups.map((group, groupIdx) => {
                                const firstIdx = group[0];
                                const lastIdx = group[group.length - 1];
                                const canExtendBefore = firstIdx > 1;
                                const canExtendAfter = lastIdx < totalSentences;
                                return (
                                    <div key={groupIdx} className="topic-sentences-modal__range-group">
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
                                                    className={`topic-sentences-modal__sentence${isFirst ? ' topic-sentences-modal__sentence--first' : ''}${isExtended ? ' topic-sentences-modal__sentence--extended' : ''}`}
                                                >
                                                    <span className="topic-sentences-modal__sentence-num">{idx}.</span>
                                                    <span className="topic-sentences-modal__sentence-text">
                                                        <HighlightedText
                                                            text={sentences && sentences[idx - 1] ? sentences[idx - 1] : ''}
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
            </div>
        </div>
    );
}

export default TopicSentencesModal;
