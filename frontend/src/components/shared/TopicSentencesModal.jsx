import React, { useEffect } from 'react';
import './TopicSentencesModal.css';

function TopicSentencesModal({ topic, sentences, onClose }) {
    useEffect(() => {
        const handleKey = e => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    if (!topic) return null;

    // Support both an array of indices and a Set of indices
    const indicesList = Array.isArray(topic.sentenceIndices) 
        ? topic.sentenceIndices 
        : (topic.sentenceIndices ? Array.from(topic.sentenceIndices) : []);

    const sortedIndices = [...indicesList].sort((a, b) => a - b);

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
                <div className="topic-sentences-modal__body">
                    {sortedIndices.length === 0 ? (
                        <p>No sentences found for this topic.</p>
                    ) : (
                        sortedIndices.map(idx => (
                            <div key={idx} className="topic-sentences-modal__sentence">
                                <span className="topic-sentences-modal__sentence-num">{idx}.</span>
                                <span className="topic-sentences-modal__sentence-text">
                                    {sentences && sentences[idx - 1] ? sentences[idx - 1] : ''}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default TopicSentencesModal;
