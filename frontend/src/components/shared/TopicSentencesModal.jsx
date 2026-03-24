import React, { useEffect, useState } from 'react';
import './TopicSentencesModal.css';
import MarkupRenderer from '../markup/MarkupRenderer';

const EXTEND_COUNT = 3;

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

    const isRead = topic && readTopics instanceof Set ? readTopics.has(topic.name) : false;

    const topicMarkup = markup && topic
        ? (markup[topic.name] || markup[topic.displayName] || null)
        : null;
    const hasEnrichedMarkup = topicMarkup && topicMarkup.segments && topicMarkup.segments.length > 0;

    useEffect(() => {
        setExtendedIndices(new Set());
        setActiveTab(hasEnrichedMarkup ? 'enriched' : 'sentences');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topic]);

    useEffect(() => {
        const handleKey = e => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    if (!topic) return null;

    const indicesList = Array.isArray(topic.sentenceIndices)
        ? topic.sentenceIndices
        : (topic.sentenceIndices ? Array.from(topic.sentenceIndices) : []);

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
                    <h3>{topic.displayName}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {onToggleRead && (
                            <button
                                type="button"
                                className={`topic-sentences-modal__read-btn${isRead ? ' topic-sentences-modal__read-btn--active' : ''}`}
                                onClick={() => {
                                    const ranges = topic.ranges;
                                    if (Array.isArray(ranges) && ranges.length > 1 && !isRead) {
                                        const ok = window.confirm(
                                            `"${topic.name}" has ${ranges.length} separate ranges. Some may not be visible on screen. Mark as read?`
                                        );
                                        if (!ok) return;
                                    }
                                    onToggleRead(topic);
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
                                onClick={() => { onShowInArticle(topic); onClose(); }}
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
                        <MarkupRenderer segments={topicMarkup.segments} sentences={sentences} />
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
