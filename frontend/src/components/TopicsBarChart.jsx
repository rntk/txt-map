import React, { useMemo, useState } from 'react';

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
            <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#888',
                fontSize: '14px'
            }}>
                No second-level subtopic data available.
            </div>
        );
    }

    return (
        <div style={{
            backgroundColor: '#f0ece4',
            borderRadius: '6px',
            border: '2px solid #888',
            overflow: 'hidden',
            fontFamily: 'Georgia, "Times New Roman", serif'
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 20px 12px',
                textAlign: 'center',
                borderBottom: '3px solid #c0392b'
            }}>
                <h2 style={{
                    margin: '0 0 4px',
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#2c2c2c'
                }}>
                    Topics Overview
                </h2>
                <p style={{
                    margin: '0 0 6px',
                    fontSize: '13px',
                    color: '#555',
                    fontStyle: 'italic'
                }}>
                    &ndash; character count by subtopic (second-level) &ndash;
                </p>
                <div style={{
                    display: 'inline-block',
                    backgroundColor: '#fffbe6',
                    border: '1px solid #c0392b',
                    padding: '2px 12px',
                    fontSize: '13px',
                    fontStyle: 'italic',
                    color: '#c0392b'
                }}>
                    Total: {totalAllChars.toLocaleString()} characters
                </div>
            </div>

            {/* Chart body */}
            <div style={{
                padding: '16px 20px 12px',
            }}>
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
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '10px 0',
                                borderBottom: isLast ? 'none' : '1px dashed #b0a898',
                            }}
                            onMouseEnter={() => setHoveredBar(index)}
                            onMouseLeave={() => setHoveredBar(null)}
                        >
                            {/* Bar */}
                            <div style={{
                                width: `${barWidthPercent}%`,
                                minHeight: '44px',
                                backgroundColor: isHovered ? color : color,
                                opacity: isHovered ? 1 : 0.85,
                                border: `1.5px solid ${isHovered ? '#333' : '#777'}`,
                                borderRadius: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '4px 8px',
                                boxSizing: 'border-box',
                                transition: 'opacity 0.15s ease',
                                position: 'relative',
                                cursor: 'default'
                            }}>
                                <span style={{
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    color: '#2c2c2c',
                                    textShadow: '0 0 4px rgba(255,255,255,0.6)',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {item.totalChars.toLocaleString()}
                                </span>
                            </div>

                            {/* Label to the right of the bar */}
                            <div style={{
                                marginLeft: '12px',
                                flex: 1,
                                minWidth: 0
                            }}>
                                <div style={{
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    color: '#2c2c2c',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {item.barTitle}
                                </div>
                                {item.deeperTopics.length > 0 && (
                                    <div style={{
                                        fontSize: '11px',
                                        color: '#777',
                                        fontStyle: 'italic',
                                        marginTop: '2px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        ({item.deeperTopics.join(', ')})
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div style={{
                padding: '10px 20px 14px',
                borderTop: '1px solid #c8c0b4',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '14px',
                justifyContent: 'center'
            }}>
                {Object.entries(colorScale).map(([topLevel, color]) => (
                    <div
                        key={topLevel}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px'
                        }}
                    >
                        <div style={{
                            width: '16px',
                            height: '16px',
                            backgroundColor: color,
                            border: '1px solid #777',
                            borderRadius: '1px'
                        }} />
                        <span style={{ color: '#444' }}>{topLevel}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default TopicsBarChart;
