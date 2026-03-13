import React, { useMemo, useState } from 'react';
import './TopicsBarChart.css';

/**
 * TopicsBarChart
 * - Creates one bar per second-level subtopic: TopLevel>SecondLevel
 * - Bar width is based on sentence character count
 * - Infographic style: bars sorted smallest-to-largest (top to bottom),
 *   value inside bar, label to the right
 */
function TopicsBarChart({ topics, sentences = [] }) {
    const [hoveredBar, setHoveredBar] = useState(null);
    const MAX_BAR_WIDTH_PERCENT = 78;

    const chartData = useMemo(() => {
        if (!topics || topics.length === 0) return [];

        const subtopicMap = new Map();
        const hasSentenceText = Array.isArray(sentences) && sentences.length > 0;

        topics.forEach(topic => {
            const parts = topic.name.split('>').map(p => p.trim());

            // Skip top-level topics; only second-level and deeper create bars.
            if (parts.length < 2) return;

            const topLevel = parts[0];
            const secondLevel = parts[1];
            const barTitle = `${topLevel}>${secondLevel}`;
            const key = barTitle;

            if (!subtopicMap.has(key)) {
                subtopicMap.set(key, {
                    id: key,
                    barTitle,
                    topLevel,
                    deeperPaths: new Set(),
                    sentenceIndices: new Set(),
                    fallbackChars: 0
                });
            }

            const entry = subtopicMap.get(key);

            if (parts.length > 2) {
                entry.deeperPaths.add(parts.slice(2).join('>'));
            }

            const topicSentenceIndices = Array.isArray(topic.sentences) ? topic.sentences : [];
            if (topicSentenceIndices.length > 0) {
                topicSentenceIndices.forEach((index) => {
                    const oneBased = Number(index);
                    if (Number.isInteger(oneBased) && oneBased > 0) {
                        entry.sentenceIndices.add(oneBased);
                    }
                });
            } else if (!hasSentenceText && Number.isFinite(topic.totalChars)) {
                entry.fallbackChars += topic.totalChars;
            }
        });

        const getCharsFromSentenceIndices = (indices) => {
            let total = 0;
            indices.forEach((oneBased) => {
                const sentence = sentences[oneBased - 1];
                if (typeof sentence === 'string') {
                    total += sentence.length;
                }
            });
            return total;
        };

        const result = Array.from(subtopicMap.values()).map((entry) => {
            const totalChars = hasSentenceText
                ? getCharsFromSentenceIndices(entry.sentenceIndices)
                : entry.fallbackChars;

            return {
                id: entry.id,
                barTitle: entry.barTitle,
                topLevel: entry.topLevel,
                deeperTopics: Array.from(entry.deeperPaths).sort(),
                totalChars,
                sentenceCount: entry.sentenceIndices.size
            };
        })
            // Sort smallest to largest (top to bottom), like the infographic
            .sort((a, b) => a.totalChars - b.totalChars || a.barTitle.localeCompare(b.barTitle));

        return result;
    }, [topics, sentences]);

    const maxChars = useMemo(() => {
        if (chartData.length === 0) return 100;
        const max = Math.max(...chartData.map(d => d.totalChars));
        return max > 0 ? max : 1;
    }, [chartData]);

    // Warm, muted color palette inspired by the infographic
    const colorScale = useMemo(() => {
        const colors = {};
        const baseColors = [
            '#a8c4d8', // light steel blue
            '#c4a882', // warm tan
            '#9ab8a0', // sage green
            '#d4917a', // muted coral
            '#5a5a5a', // charcoal
            '#b8a9c8', // dusty lavender
            '#c9b458', // muted gold
            '#8aafaf', // teal gray
            '#c48e8e', // dusty rose
            '#8b9dc3', // slate blue
        ];

        chartData.forEach((item) => {
            if (!colors[item.topLevel]) {
                const colorIndex = Object.keys(colors).length % baseColors.length;
                colors[item.topLevel] = baseColors[colorIndex];
            }
        });

        return colors;
    }, [chartData]);

    // Compute total chars across all bars for the header
    const totalAllChars = useMemo(() => {
        return chartData.reduce((sum, item) => sum + item.totalChars, 0);
    }, [chartData]);

    if (chartData.length === 0) {
        return (
            <div className="topics-bar-chart-empty-state">
                No second-level subtopic data available.
            </div>
        );
    }

    return (
        <div className="topics-bar-chart">
            {/* Header */}
            <div className="topics-bar-chart__header">
                <h2 className="topics-bar-chart__title">
                    Topics Overview
                </h2>
                <p className="topics-bar-chart__subtitle">
                    &ndash; character count by subtopic (second-level) &ndash;
                </p>
                <div className="topics-bar-chart__total">
                    Total: {totalAllChars.toLocaleString()} characters
                </div>
            </div>

            {/* Chart body */}
            <div className="topics-bar-chart__body" data-testid="topics-bar-chart-scroll">
                {chartData.map((item, index) => {
                    // Reserve horizontal room so right-side labels remain visible,
                    // even when the largest bar dominates the chart.
                    const scaledBarWidthPercent = (item.totalChars / maxChars) * MAX_BAR_WIDTH_PERCENT;
                    const barWidthPercent = Math.max(scaledBarWidthPercent, 8);
                    const color = colorScale[item.topLevel] || '#999';
                    const isHovered = hoveredBar === index;
                    const isLast = index === chartData.length - 1;

                    return (
                        <div
                            key={item.id}
                            className={`topics-bar-chart__row${isLast ? ' topics-bar-chart__row--last' : ''}`}
                            onMouseEnter={() => setHoveredBar(index)}
                            onMouseLeave={() => setHoveredBar(null)}
                        >
                            {/* Bar */}
                            <div
                                className={`topics-bar-chart__bar${isHovered ? ' topics-bar-chart__bar--hovered' : ''}`}
                                style={{
                                    width: `${barWidthPercent}%`,
                                    backgroundColor: color,
                                    borderColor: isHovered ? '#333' : '#777',
                                }}
                            >
                                <span className="topics-bar-chart__bar-value">
                                    {item.totalChars.toLocaleString()}
                                </span>
                            </div>

                            {/* Label to the right of the bar */}
                            <div className="topics-bar-chart__label-group">
                                <div className="topics-bar-chart__label">
                                    {item.barTitle}
                                </div>
                                {item.deeperTopics.length > 0 && (
                                    <div className="topics-bar-chart__deeper-topics">
                                        ({item.deeperTopics.join(', ')})
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="topics-bar-chart__legend">
                {Object.entries(colorScale).map(([topLevel, color]) => (
                    <div
                        key={topLevel}
                        className="topics-bar-chart__legend-item"
                    >
                        <div
                            className="topics-bar-chart__legend-swatch"
                            style={{ backgroundColor: color }}
                        />
                        <span className="topics-bar-chart__legend-label">{topLevel}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default TopicsBarChart;
