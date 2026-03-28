import React, { useContext, useMemo } from 'react';
import { HighlightContext } from './HighlightContext';

/**
 * @typedef {Object} HighlightedTextProps
 * @property {string} text
 * @property {string[]} [words] - Override for words from HighlightContext
 */

/**
 * @param {HighlightedTextProps} props
 */
export default function HighlightedText({ text, words }) {
    const contextWords = useContext(HighlightContext);
    const highlightWords = useMemo(() => {
        const sourceWords = Array.isArray(words) ? words : contextWords;
        if (!Array.isArray(sourceWords) || sourceWords.length === 0) return [];
        return sourceWords.filter(word => word.length > 0);
    }, [words, contextWords]);

    if (!text || highlightWords.length === 0 || typeof text !== 'string') {
        return <>{text}</>;
    }

    const escapedWords = highlightWords.map(word => 
        word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    // Use word boundaries for better matching
    const regex = new RegExp(`(\\b${escapedWords.join('\\b|\\b')}\\b)`, 'gi');
    const parts = text.split(regex);

    return (
        <>
            {parts.map((part, i) => {
                const isMatch = highlightWords.some(word => 
                    new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(part)
                );
                return isMatch ? (
                    <mark key={i} className="topic-sentences-modal__highlight">{part}</mark>
                ) : (
                    part
                );
            })}
        </>
    );
}
