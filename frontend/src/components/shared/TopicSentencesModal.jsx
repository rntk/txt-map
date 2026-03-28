import React, { useEffect, useState } from 'react';
import './TopicSentencesModal.css';
import MarkupRenderer from '../markup/MarkupRenderer';
import { getSegmentIndices } from '../markup/markupUtils';

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

function distributePositionsAcrossGroups(sortedPositions, groups) {
    if (!Array.isArray(sortedPositions) || sortedPositions.length === 0 || !Array.isArray(groups) || groups.length === 0) {
        return [];
    }

    const totalWeight = groups.reduce((sum, group) => {
        const explicitCount = Array.isArray(group.sentenceIndices) ? group.sentenceIndices.length : 0;
        const rangeCount = Number.isInteger(group.firstSourceSentenceIndex) && Number.isInteger(group.lastSourceSentenceIndex)
            ? Math.max(1, group.lastSourceSentenceIndex - group.firstSourceSentenceIndex + 1)
            : 1;
        return sum + Math.max(explicitCount, rangeCount, 1);
    }, 0);

    const remainingGroupCount = groups.length;
    let remainingPositions = sortedPositions.length;
    let offset = 0;

    return groups.map((group, groupIndex) => {
        const explicitCount = Array.isArray(group.sentenceIndices) ? group.sentenceIndices.length : 0;
        const rangeCount = Number.isInteger(group.firstSourceSentenceIndex) && Number.isInteger(group.lastSourceSentenceIndex)
            ? Math.max(1, group.lastSourceSentenceIndex - group.firstSourceSentenceIndex + 1)
            : 1;
        const weight = Math.max(explicitCount, rangeCount, 1);
        const groupsLeft = remainingGroupCount - groupIndex;

        let allocation;
        if (groupIndex === groups.length - 1) {
            allocation = remainingPositions;
        } else {
            const proportional = totalWeight > 0
                ? Math.round((weight / totalWeight) * sortedPositions.length)
                : 1;
            const maxAllocation = remainingPositions - (groupsLeft - 1);
            allocation = Math.max(1, Math.min(maxAllocation, proportional));
        }

        const nextOffset = offset + allocation;
        const positions = sortedPositions.slice(offset, nextOffset);
        offset = nextOffset;
        remainingPositions -= positions.length;

        return {
            ...group,
            positions,
        };
    }).filter((group) => group.positions.length > 0);
}

const INDEX_ARRAY_KEYS = new Set([
    'position_indices',
    'sentence_indices',
    'answer_position_indices',
    'answer_sentence_indices',
    'explanation_position_indices',
    'explanation_sentence_indices',
]);

const WORD_INDEX_ARRAY_KEYS = new Set([
    'word_indices',
    'answer_word_indices',
    'question_word_indices',
    'title_word_indices',
    'term_word_indices',
]);

const INDEX_VALUE_KEYS = new Set([
    'position_index',
    'sentence_index',
    'title_position_index',
    'title_sentence_index',
    'question_position_index',
    'question_sentence_index',
]);

const ATOMIC_SEGMENT_TYPES = new Set(['data_trend']);

/**
 * @typedef {Object} TopicMarkupPosition
 * @property {number} [index]
 * @property {string} [text]
 * @property {number} [source_sentence_index]
 *
 * @typedef {Object} EnrichedRangeGroup
 * @property {number} groupNumber
 * @property {number} firstSourceSentenceIndex
 * @property {number} lastSourceSentenceIndex
 * @property {TopicMarkupPosition[]} positions
 *
 * @typedef {Object} RemappedTopicMarkup
 * @property {TopicMarkupPosition[]} positions
 * @property {Array<Record<string, unknown>>} segments
 */

function getPositionSourceSentenceIndex(position, fallbackIndex) {
    if (Number.isInteger(position?.source_sentence_index)) {
        return position.source_sentence_index;
    }
    if (Number.isInteger(position?.index)) {
        return position.index;
    }
    return fallbackIndex;
}

/**
 * @param {number[]} sentenceIndices
 * @returns {Array<{ firstSourceSentenceIndex: number, lastSourceSentenceIndex: number, sentenceIndices: number[] }>}
 */
function buildSentenceGroupsFromIndices(sentenceIndices) {
    if (!Array.isArray(sentenceIndices) || sentenceIndices.length === 0) {
        return [];
    }

    const sortedIndices = sentenceIndices
        .filter((index) => Number.isInteger(index))
        .slice()
        .sort((left, right) => left - right);

    return groupConsecutive(sortedIndices).map((group) => ({
        firstSourceSentenceIndex: group[0],
        lastSourceSentenceIndex: group[group.length - 1],
        sentenceIndices: group,
    }));
}

/**
 * @param {Array<unknown>} ranges
 * @returns {Array<{ firstSourceSentenceIndex: number, lastSourceSentenceIndex: number }>}
 */
function buildSentenceGroupsFromRanges(ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) {
        return [];
    }

    return ranges
        .map((range) => {
            const firstSourceSentenceIndex = Number.isInteger(range?.sentence_start)
                ? range.sentence_start
                : null;
            const lastSourceSentenceIndex = Number.isInteger(range?.sentence_end)
                ? range.sentence_end
                : firstSourceSentenceIndex;

            if (!Number.isInteger(firstSourceSentenceIndex) || !Number.isInteger(lastSourceSentenceIndex)) {
                return null;
            }

            return {
                firstSourceSentenceIndex,
                lastSourceSentenceIndex,
            };
        })
        .filter(Boolean)
        .sort((left, right) => left.firstSourceSentenceIndex - right.firstSourceSentenceIndex);
}

/**
 * @param {TopicMarkupPosition[]} positions
 * @returns {EnrichedRangeGroup[]}
 */
function buildEnrichedRangeGroups(positions) {
    if (!Array.isArray(positions) || positions.length === 0) {
        return [];
    }

    const sortedPositions = positions
        .filter((position) => Number.isInteger(position?.index))
        .slice()
        .sort((left, right) => left.index - right.index);

    if (sortedPositions.length === 0) {
        return [];
    }

    const groups = [];
    let currentGroupPositions = [];
    let currentFirstSourceSentenceIndex = null;
    let currentLastSourceSentenceIndex = null;

    sortedPositions.forEach((position, index) => {
        const sourceSentenceIndex = getPositionSourceSentenceIndex(position, index + 1);
        const isAdjacent = currentLastSourceSentenceIndex != null
            && sourceSentenceIndex <= currentLastSourceSentenceIndex + 1;

        if (currentGroupPositions.length > 0 && !isAdjacent) {
            groups.push({
                groupNumber: groups.length + 1,
                firstSourceSentenceIndex: currentFirstSourceSentenceIndex,
                lastSourceSentenceIndex: currentLastSourceSentenceIndex,
                positions: currentGroupPositions,
            });
            currentGroupPositions = [];
            currentFirstSourceSentenceIndex = null;
            currentLastSourceSentenceIndex = null;
        }

        currentGroupPositions.push(position);
        if (currentFirstSourceSentenceIndex == null) {
            currentFirstSourceSentenceIndex = sourceSentenceIndex;
        }
        currentLastSourceSentenceIndex = sourceSentenceIndex;
    });

    if (currentGroupPositions.length > 0) {
        groups.push({
            groupNumber: groups.length + 1,
            firstSourceSentenceIndex: currentFirstSourceSentenceIndex,
            lastSourceSentenceIndex: currentLastSourceSentenceIndex,
            positions: currentGroupPositions,
        });
    }

    return groups;
}

/**
 * @param {TopicMarkupPosition[]} positions
 * @param {number[]} sentenceIndices
 * @param {Array<unknown>} ranges
 * @returns {EnrichedRangeGroup[]}
 */
function buildEnrichedRangeGroupsWithFallbacks(positions, sentenceIndices, ranges) {
    const groupsFromPositions = buildEnrichedRangeGroups(positions);
    if (groupsFromPositions.length > 1) {
        return groupsFromPositions;
    }

    const sortedPositions = Array.isArray(positions)
        ? positions
            .filter((position) => Number.isInteger(position?.index))
            .slice()
            .sort((left, right) => left.index - right.index)
        : [];

    if (sortedPositions.length === 0) {
        return [];
    }

    const groupsFromSentenceIndices = buildSentenceGroupsFromIndices(sentenceIndices);
    if (groupsFromSentenceIndices.length > 1) {
        return distributePositionsAcrossGroups(
            sortedPositions,
            groupsFromSentenceIndices.map((group, index) => ({
                groupNumber: index + 1,
                firstSourceSentenceIndex: group.firstSourceSentenceIndex,
                lastSourceSentenceIndex: group.lastSourceSentenceIndex,
                sentenceIndices: group.sentenceIndices,
            }))
        );
    }

    const groupsFromRanges = buildSentenceGroupsFromRanges(ranges);
    if (groupsFromRanges.length > 1) {
        return distributePositionsAcrossGroups(
            sortedPositions,
            groupsFromRanges.map((group, index) => ({
                groupNumber: index + 1,
                firstSourceSentenceIndex: group.firstSourceSentenceIndex,
                lastSourceSentenceIndex: group.lastSourceSentenceIndex,
            }))
        );
    }

    return groupsFromPositions;
}

function remapNestedMarkupValue(value, positionIndexMap, wordIndexMap) {
    if (Array.isArray(value)) {
        return value
            .map((item) => remapNestedMarkupValue(item, positionIndexMap, wordIndexMap))
            .filter((item) => item !== undefined);
    }

    if (value && typeof value === 'object') {
        const nextValue = {};
        Object.entries(value).forEach(([key, nestedValue]) => {
            if (INDEX_ARRAY_KEYS.has(key)) {
                const remappedIndices = Array.isArray(nestedValue)
                    ? [...new Set(
                        nestedValue
                            .map((index) => positionIndexMap.get(index))
                            .filter((index) => Number.isInteger(index))
                    )].sort((a, b) => a - b)
                    : [];
                if (remappedIndices.length > 0) {
                    nextValue[key] = remappedIndices;
                }
                return;
            }

            if (WORD_INDEX_ARRAY_KEYS.has(key)) {
                const remappedWordIndices = Array.isArray(nestedValue)
                    ? [...new Set(
                        nestedValue
                            .map((index) => wordIndexMap.get(index))
                            .filter((index) => Number.isInteger(index))
                    )].sort((a, b) => a - b)
                    : [];
                if (remappedWordIndices.length > 0) {
                    nextValue[key] = remappedWordIndices;
                }
                return;
            }

            if (INDEX_VALUE_KEYS.has(key)) {
                const remappedIndex = positionIndexMap.get(nestedValue);
                if (Number.isInteger(remappedIndex)) {
                    nextValue[key] = remappedIndex;
                }
                return;
            }

            const remappedNestedValue = remapNestedMarkupValue(
                nestedValue,
                positionIndexMap,
                wordIndexMap
            );
            if (remappedNestedValue !== undefined) {
                nextValue[key] = remappedNestedValue;
            }
        });
        return nextValue;
    }

    return value;
}

/**
 * @param {Record<string, unknown> | null | undefined} topicMarkup
 * @param {EnrichedRangeGroup} rangeGroup
 * @returns {RemappedTopicMarkup}
 */
function buildGroupMarkup(topicMarkup, rangeGroup) {
    const segments = Array.isArray(topicMarkup?.segments) ? topicMarkup.segments : [];
    const groupPositions = Array.isArray(rangeGroup?.positions) ? rangeGroup.positions : [];
    const groupPositionIndexSet = new Set(groupPositions.map((position) => position.index));
    const groupPositionIndexMap = new Map(
        groupPositions.map((position, index) => [position.index, index + 1])
    );
    const groupWordIndexMap = new Map();
    let nextGroupWordIndex = 1;

    groupPositions.forEach((position) => {
        const wordStartIndex = Number.isInteger(position?.word_start_index)
            ? position.word_start_index
            : null;
        const wordEndIndex = Number.isInteger(position?.word_end_index)
            ? position.word_end_index
            : null;
        if (wordStartIndex == null || wordEndIndex == null || wordEndIndex < wordStartIndex) {
            return;
        }
        for (let index = wordStartIndex; index <= wordEndIndex; index += 1) {
            groupWordIndexMap.set(index, nextGroupWordIndex);
            nextGroupWordIndex += 1;
        }
    });

    const remappedSegments = segments.reduce((nextSegments, segment) => {
        const segmentIndices = getSegmentIndices(segment);
        const overlappingIndices = segmentIndices.filter((index) => groupPositionIndexSet.has(index));

        if (overlappingIndices.length === 0) {
            return nextSegments;
        }

        const isAtomicCrossRangeSegment = ATOMIC_SEGMENT_TYPES.has(segment?.type)
            && overlappingIndices.length !== segmentIndices.length;
        if (isAtomicCrossRangeSegment && segmentIndices[0] !== overlappingIndices[0]) {
            return nextSegments;
        }

        const remappedSegment = remapNestedMarkupValue(
            segment,
            groupPositionIndexMap,
            groupWordIndexMap
        );
        remappedSegment.position_indices = overlappingIndices
            .map((index) => groupPositionIndexMap.get(index))
            .filter((index) => Number.isInteger(index))
            .sort((a, b) => a - b);

        if (remappedSegment.position_indices.length === 0) {
            return nextSegments;
        }

        nextSegments.push(remappedSegment);
        return nextSegments;
    }, []);

    return {
        positions: groupPositions.map((position, index) => {
            const wordStartIndex = Number.isInteger(position?.word_start_index)
                ? groupWordIndexMap.get(position.word_start_index)
                : undefined;
            const wordEndIndex = Number.isInteger(position?.word_end_index)
                ? groupWordIndexMap.get(position.word_end_index)
                : undefined;

            return {
                ...position,
                index: index + 1,
                ...(Number.isInteger(wordStartIndex) ? { word_start_index: wordStartIndex } : {}),
                ...(Number.isInteger(wordEndIndex) ? { word_end_index: wordEndIndex } : {}),
            };
        }),
        segments: remappedSegments,
    };
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

/**
 * @param {Record<string, unknown> | null | undefined} markup
 * @param {TopicSentencesModalTopic | null} topic
 * @returns {any}
 */
function resolveTopicMarkup(markup, topic) {
    if (!markup || !topic) {
        return null;
    }

    const candidateKeys = [...new Set(
        [topic.name, topic.fullPath, topic.displayName]
            .filter((key) => typeof key === 'string')
            .map((key) => key.trim())
            .filter(Boolean)
    )];

    for (const key of candidateKeys) {
        if (markup[key]) {
            return markup[key];
        }
    }

    return null;
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
                                                    {sentences && sentences[idx - 1] ? sentences[idx - 1] : ''}
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
                </div>
            </div>
        </div>
    );
}

export default TopicSentencesModal;
