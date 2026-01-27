/**
 * Shared utilities for River Charts
 */

import * as d3 from 'd3';

/**
 * Calculates bins for a river chart based on sentence indices.
 * 
 * @param {number} binCount - Number of bins to create
 * @param {Array} items - List of items (topics/subtopics) with 'sentences' array
 * @param {number} startRange - Start of the sentence range
 * @param {number} endRange - End of the sentence range
 * @param {string} nameKey - Key to use for the item name in bins
 * @returns {Array} Array of bin objects
 */
export const calculateBins = (binCount, items, startRange, endRange, nameKey = 'name') => {
    const range = endRange - startRange;
    const binSize = Math.max(1, range / binCount);

    return Array.from({ length: binCount }, (_, i) => {
        const start = startRange + i * binSize;
        const end = startRange + (i + 1) * binSize;
        const binData = { x: i, rangeStart: start, rangeEnd: end };

        items.forEach(item => {
            const name = item[nameKey];
            // Count sentences of this item in this bin
            const count = item.sentences.filter(s => s >= start && s < end).length;
            binData[name] = count;
        });
        return binData;
    });
};

/**
 * Applies smoothing to binned data.
 * 
 * @param {Array} bins - Array of bin objects
 * @param {Array} items - List of items with 'name' property
 * @param {string} nameKey - Key to use for the item name
 * @returns {Array} Smoothed bin objects
 */
export const smoothBins = (bins, items, nameKey = 'name') => {
    return bins.map((bin, i) => {
        const smoothedBin = { ...bin };

        items.forEach(item => {
            const name = item[nameKey];
            const currentVal = bin[name] || 0;

            if (currentVal === 0) {
                const prevVal = i > 0 ? (bins[i - 1][name] || 0) : 0;
                const nextVal = i < bins.length - 1 ? (bins[i + 1][name] || 0) : 0;

                if (prevVal > 0 && nextVal > 0) {
                    smoothedBin[name] = Math.min(prevVal, nextVal) * 0.3;
                } else if (prevVal > 0 || nextVal > 0) {
                    smoothedBin[name] = Math.max(prevVal, nextVal) * 0.1;
                } else {
                    smoothedBin[name] = 0;
                }
            } else {
                const prevVal = i > 0 ? (bins[i - 1][name] || 0) : currentVal;
                const nextVal = i < bins.length - 1 ? (bins[i + 1][name] || 0) : currentVal;
                smoothedBin[name] = currentVal * 0.6 + prevVal * 0.2 + nextVal * 0.2;
            }
        });
        return smoothedBin;
    });
};

/**
 * Converts sentence counts to estimated character counts.
 */
export const estimateCharacterCounts = (bins, items, nameKey = 'name') => {
    return bins.map(bin => {
        const charBin = { ...bin };

        items.forEach(item => {
            const name = item[nameKey];
            const sentenceCount = bin[name] || 0;
            const avgCharsPerSentence = item.avgCharsPerSentence ||
                (item.totalChars && item.sentences?.length ? item.totalChars / item.sentences.length : 100);
            charBin[name] = sentenceCount * avgCharsPerSentence;
        });

        return charBin;
    });
};

/**
 * Common color scale for charts
 */
export const getRiverColorScale = (keys) => {
    return d3.scaleOrdinal()
        .domain(keys)
        .range(d3.schemePastel1.concat(d3.schemeSet2).concat(d3.schemeTableau10));
};
