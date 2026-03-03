import React, { useMemo, useState } from 'react';

/**
 * TopicsBarChart - Displays subtopics (level 2+) as horizontal bars.
 * Bar width = number of characters in sentences for that subtopic.
 * Title format: "TopLevel > SecondLevel"
 * Subtitle row: shows remaining path levels (3+)
 */
function TopicsBarChart({ topics }) {
    const [hoveredBar, setHoveredBar] = useState(null);

    // Process topics to extract level 2+ subtopics with character counts
    const chartData = useMemo(() => {
        if (!topics || topics.length === 0) return [];

        // Group by top-level > second-level combination
        const subtopicMap = new Map();

        topics.forEach(topic => {
            const parts = topic.name.split('>').map(p => p.trim());
            
            // Skip if less than 2 levels (we only show level 2+)
            if (parts.length < 2) return;

            const topLevel = parts[0];
            const secondLevel = parts[1];
            const barTitle = `${topLevel} > ${secondLevel}`;
            
            // Get remaining levels (3+) for subtitle
            const remainingLevels = parts.length > 2 
                ? parts.slice(2).join(' > ') 
                : null;

            // Calculate total characters from sentences
            const totalChars = topic.totalChars || 0;
            const sentenceCount = topic.sentences ? topic.sentences.length : 0;

            const key = `${barTitle}${remainingLevels ? ` > ${remainingLevels}` : ''}`;

            if (!subtopicMap.has(key)) {
                subtopicMap.set(key, {
                    barTitle,
                    subTitle: remainingLevels,
                    topLevel,
                    secondLevel,
                    totalChars,
                    sentenceCount,
                    fullPath: topic.name
                });
            } else {
                // Aggregate if same barTitle + subTitle combination appears multiple times
                const existing = subtopicMap.get(key);
                existing.totalChars += totalChars;
                existing.sentenceCount += sentenceCount;
            }
        });

        // Convert to array and sort by totalChars descending
        const result = Array.from(subtopicMap.values())
            .sort((a, b) => b.totalChars - a.totalChars);

        return result;
    }, [topics]);

    // Calculate max chars for scaling
    const maxChars = useMemo(() => {
        if (chartData.length === 0) return 100;
        return Math.max(...chartData.map(d => d.totalChars));
    }, [chartData]);

    // Color scale based on top-level topic
    const colorScale = useMemo(() => {
        const colors = {};
        const baseColors = [
            '#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f',
            '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab5ac',
            '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c',
            '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5'
        ];
        
        chartData.forEach((item, index) => {
            if (!colors[item.topLevel]) {
                const colorIndex = Object.keys(colors).length % baseColors.length;
                colors[item.topLevel] = baseColors[colorIndex];
            }
        });
        
        return colors;
    }, [chartData]);

    if (chartData.length === 0) {
        return (
            <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#888',
                fontSize: '14px'
            }}>
                No subtopic data available. Subtopics are displayed for topics with 2+ levels (split by '&gt;').
            </div>
        );
    }

    return (
        <div style={{
            padding: '20px',
            backgroundColor: '#fafafa',
            borderRadius: '8px',
            border: '1px solid #eee'
        }}>
            <h2 style={{ marginBottom: '10px', fontSize: '18px', color: '#333' }}>
                Topics Overview
            </h2>
            <p style={{ marginBottom: '20px', color: '#666', fontSize: '13px' }}>
                Horizontal bars represent subtopics (level 2+). Bar width shows character count in sentences.
            </p>

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                {chartData.map((item, index) => {
                    const barWidthPercent = (item.totalChars / maxChars) * 100;
                    const color = colorScale[item.topLevel] || '#999';
                    const isHovered = hoveredBar === index;

                    return (
                        <div
                            key={item.fullPath}
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '8px 0',
                                borderBottom: '1px solid #eee'
                            }}
                            onMouseEnter={() => setHoveredBar(index)}
                            onMouseLeave={() => setHoveredBar(null)}
                        >
                            {/* Label column */}
                            <div style={{
                                width: '280px',
                                flexShrink: 0,
                                paddingTop: '8px'
                            }}>
                                <div style={{
                                    fontWeight: '600',
                                    fontSize: '13px',
                                    color: '#333',
                                    marginBottom: '2px'
                                }}>
                                    {item.barTitle}
                                </div>
                                {item.subTitle && (
                                    <div style={{
                                        fontSize: '11px',
                                        color: '#888',
                                        fontStyle: 'italic'
                                    }}>
                                        {item.subTitle}
                                    </div>
                                )}
                            </div>

                            {/* Bar column */}
                            <div style={{
                                flex: 1,
                                position: 'relative',
                                minHeight: '36px',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                <div style={{
                                    width: '100%',
                                    height: '28px',
                                    backgroundColor: '#e8e8e8',
                                    borderRadius: '3px',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}>
                                    <div
                                        style={{
                                            width: `${barWidthPercent}%`,
                                            height: '100%',
                                            backgroundColor: color,
                                            opacity: isHovered ? 0.9 : 0.8,
                                            transition: 'opacity 0.2s ease',
                                            borderRadius: '3px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'flex-end',
                                            paddingRight: '8px',
                                            boxSizing: 'border-box'
                                        }}
                                    >
                                        {barWidthPercent > 15 && (
                                            <span style={{
                                                color: '#fff',
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                            }}>
                                                {item.totalChars.toLocaleString()} chars
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Character count label (outside bar if too small) */}
                                {barWidthPercent <= 15 && (
                                    <span style={{
                                        position: 'absolute',
                                        left: `${barWidthPercent}%`,
                                        marginLeft: '8px',
                                        fontSize: '11px',
                                        color: '#666',
                                        fontWeight: '500'
                                    }}>
                                        {item.totalChars.toLocaleString()} chars
                                    </span>
                                )}
                            </div>

                            {/* Stats column */}
                            <div style={{
                                width: '100px',
                                flexShrink: 0,
                                paddingTop: '8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                color: '#888'
                            }}>
                                {item.sentenceCount} sent.
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div style={{
                marginTop: '20px',
                paddingTop: '15px',
                borderTop: '1px solid #eee',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px'
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
                            width: '14px',
                            height: '14px',
                            backgroundColor: color,
                            borderRadius: '2px'
                        }} />
                        <span style={{ color: '#555' }}>{topLevel}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default TopicsBarChart;
