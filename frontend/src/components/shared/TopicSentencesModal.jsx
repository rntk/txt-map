import React, { useEffect, useState } from 'react';
import './TopicSentencesModal.css';

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

function TopicSentencesModal({ topic, sentences, onClose, headerExtra }) {
    const [extendedIndices, setExtendedIndices] = useState(new Set());

    useEffect(() => {
        setExtendedIndices(new Set());
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

    return (
        <div className="topic-sentences-modal__overlay" onClick={onClose}>
            <div
                className="topic-sentences-modal"
                onClick={e => e.stopPropagation()}
            >
                <div className="topic-sentences-modal__header">
                    <h3>{topic.displayName}</h3>
                    <button
                        type="button"
                        className="topic-sentences-modal__close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>
                {headerExtra && (
                    <div className="topic-sentences-modal__header-extra">
                        {headerExtra}
                    </div>
                )}
                <div className="topic-sentences-modal__body">
                    {allIndices.length === 0 ? (
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
                                    {group.map(idx => {
                                        const isExtended = extendedIndices.has(idx);
                                        return (
                                            <div
                                                key={idx}
                                                className={`topic-sentences-modal__sentence${isExtended ? ' topic-sentences-modal__sentence--extended' : ''}`}
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
