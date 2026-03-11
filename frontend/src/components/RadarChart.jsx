import React, { useMemo, useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import '../styles/App.css';

/**
 * RadarChart
 * - Displays topics on axes in a radar/spider chart
 * - Values are total character count of sentences belonging to each topic
 * - Level selector allows viewing different hierarchy levels (0 = top level, 1 = subtopics, etc.)
 */
function RadarChart({ topics, sentences = [] }) {
    const [selectedLevel, setSelectedLevel] = useState(0);
    const [hoveredTopic, setHoveredTopic] = useState(null);
    const svgRef = useRef(null);
    const containerRef = useRef(null);

    // Parse topics and compute character counts per topic at selected level
    const chartData = useMemo(() => {
        if (!topics || topics.length === 0) return [];

        const levelMap = new Map();
        const hasSentenceText = Array.isArray(sentences) && sentences.length > 0;

        topics.forEach(topic => {
            const parts = topic.name.split('>').map(p => p.trim());
            const topicLevel = parts.length - 1; // 0-indexed level

            // Only include topics at or above the selected level
            if (topicLevel < selectedLevel) return;

            // Get the topic name at the selected level
            const topicAtLevel = parts.slice(0, selectedLevel + 1).join('>');
            const key = topicAtLevel;

            if (!levelMap.has(key)) {
                levelMap.set(key, {
                    name: topicAtLevel,
                    displayName: parts[selectedLevel],
                    level: selectedLevel,
                    sentenceIndices: new Set(),
                    fallbackChars: 0
                });
            }

            const entry = levelMap.get(key);

            // Collect sentence indices
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

        // Compute total characters for each topic
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

        const result = Array.from(levelMap.values()).map((entry) => {
            const totalChars = hasSentenceText
                ? getCharsFromSentenceIndices(entry.sentenceIndices)
                : entry.fallbackChars;

            return {
                name: entry.name,
                displayName: entry.displayName,
                level: entry.level,
                totalChars,
                sentenceCount: entry.sentenceIndices.size
            };
        })
            .filter(d => d.totalChars > 0)
            .sort((a, b) => b.totalChars - a.totalChars);

        return result;
    }, [topics, sentences, selectedLevel]);

    // Determine max level available
    const maxLevel = useMemo(() => {
        if (!topics || topics.length === 0) return 0;
        let max = 0;
        topics.forEach(topic => {
            const parts = topic.name.split('>').map(p => p.trim());
            const level = parts.length - 1;
            if (level > max) max = level;
        });
        return max;
    }, [topics]);

    // Color scale for topics
    const colorScale = useMemo(() => {
        const colors = {};
        const baseColors = [
            '#7ba3cc', '#e8a87c', '#85bb65', '#c9a0dc',
            '#d4a5a5', '#a0c4a9', '#cfb997', '#9db4c0',
            '#c2b280', '#b5c7d3', '#d4a76a', '#a5b8d0',
        ];

        chartData.forEach((item, index) => {
            colors[item.name] = baseColors[index % baseColors.length];
        });

        return colors;
    }, [chartData]);

    // Compute total chars
    const totalAllChars = useMemo(() => {
        return chartData.reduce((sum, item) => sum + item.totalChars, 0);
    }, [chartData]);

    // Draw the radar chart
    useEffect(() => {
        if (!svgRef.current || chartData.length === 0) return;

        const container = containerRef.current;
        const containerWidth = container ? container.clientWidth : 600;
        const size = Math.min(containerWidth, 600);

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = size;
        const height = size;
        const margin = 80;
        const radius = (Math.min(width, height) / 2) - margin;

        svg
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        const g = svg.append('g')
            .attr('transform', `translate(${width / 2}, ${height / 2})`);

        const angleSlice = (Math.PI * 2) / chartData.length;

        // Scale for the radius
        const maxChars = Math.max(...chartData.map(d => d.totalChars), 1);
        const rScale = d3.scaleLinear()
            .domain([0, maxChars])
            .range([0, radius]);

        // Draw circular grid
        const levels = 5;
        for (let i = 1; i <= levels; i++) {
            const r = (radius / levels) * i;
            g.append('circle')
                .attr('r', r)
                .attr('fill', 'none')
                .attr('stroke', '#ddd')
                .attr('stroke-width', '1px')
                .attr('opacity', '0.7');

            // Axis labels
            if (i === levels) {
                g.append('text')
                    .attr('x', 0)
                    .attr('y', -r - 8)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '10px')
                    .attr('fill', '#999')
                    .text(`${Math.round((maxChars / levels) * i).toLocaleString()} chars`);
            }
        }

        // Draw axes and labels
        chartData.forEach((d, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            // Axis line
            g.append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', x)
                .attr('y2', y)
                .attr('stroke', '#ccc')
                .attr('stroke-width', '1px');

            // Label
            const labelX = Math.cos(angle) * (radius + 40);
            const labelY = Math.sin(angle) * (radius + 40);

            const labelGroup = g.append('g')
                .attr('transform', `translate(${labelX}, ${labelY})`)
                .style('cursor', 'pointer');

            // Add title element for native tooltip
            labelGroup.append('title')
                .text(d.name);

            // Background for label
            const labelBg = labelGroup.append('rect')
                .attr('x', -50)
                .attr('y', -10)
                .attr('width', 100)
                .attr('height', 20)
                .attr('fill', 'white')
                .attr('stroke', '#ddd')
                .attr('rx', 3)
                .attr('opacity', '0.9');

            const labelText = labelGroup.append('text')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('font-size', '11px')
                .attr('font-weight', '600')
                .attr('fill', '#333')
                .text(d.displayName.length > 15 ? d.displayName.slice(0, 14) + '…' : d.displayName);

            // Highlight effect on hover
            labelGroup
                .on('mouseover', function() {
                    labelBg.attr('fill', '#e3f2fd').attr('stroke', '#7ba3cc');
                    labelText.attr('fill', '#1565c0');
                })
                .on('mouseout', function() {
                    labelBg.attr('fill', 'white').attr('stroke', '#ddd');
                    labelText.attr('fill', '#333');
                });

            // Adjust label background width based on text
            try {
                const textLength = labelText.node().getComputedTextLength();
                labelBg.attr('x', -(textLength / 2) - 4)
                    .attr('width', textLength + 8);
            } catch (e) {
                // Fallback if getComputedTextLength fails
            }
        });

        // Draw the radar area
        const areaPath = g.append('path')
            .datum(chartData)
            .attr('d', d3.areaRadial()
                .curve(d3.curveLinearClosed)
                .innerRadius(0)
                .outerRadius((d, i) => {
                    const angle = angleSlice * i - Math.PI / 2;
                    return rScale(d.totalChars);
                })
                .startAngle((d, i) => angleSlice * i)
                .endAngle((d, i) => angleSlice * (i + 1))
            )
            .attr('fill', 'rgba(123, 163, 204, 0.5)')
            .attr('stroke', '#7ba3cc')
            .attr('stroke-width', '2px');

        // Create tooltip group (initially hidden)
        const tooltipGroup = g.append('g')
            .attr('class', 'radar-chart-tooltip')
            .style('opacity', 0);

        // Draw points at each vertex
        chartData.forEach((d, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const r = rScale(d.totalChars);
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;

            g.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 5)
                .attr('fill', colorScale[d.name] || '#7ba3cc')
                .attr('stroke', '#fff')
                .attr('stroke-width', '2px')
                .style('cursor', 'pointer')
                .on('mouseover', (event) => {
                    setHoveredTopic(d);
                    d3.select(event.currentTarget)
                        .attr('r', 8)
                        .attr('stroke', '#333');

                    // Show tooltip near the vertex
                    const tooltipX = x + 12;
                    const tooltipY = y - 12;

                    tooltipGroup.style('opacity', 1);

                    // Tooltip background
                    tooltipGroup.selectAll('.tooltip-bg').remove();
                    tooltipGroup.append('rect')
                        .attr('class', 'tooltip-bg')
                        .attr('x', tooltipX)
                        .attr('y', tooltipY - 16)
                        .attr('rx', 4)
                        .attr('ry', 4)
                        .attr('fill', 'rgba(0, 0, 0, 0.85)')
                        .attr('width', 200)
                        .attr('height', 50);

                    // Topic name
                    tooltipGroup.append('text')
                        .attr('x', tooltipX + 8)
                        .attr('y', tooltipY - 2)
                        .attr('fill', '#fff')
                        .attr('font-size', '11px')
                        .attr('font-weight', '600')
                        .text(d.name);

                    // Character count and sentence count
                    tooltipGroup.append('text')
                        .attr('x', tooltipX + 8)
                        .attr('y', tooltipY + 14)
                        .attr('fill', '#ccc')
                        .attr('font-size', '10px')
                        .text(`${d.totalChars.toLocaleString()} chars • ${d.sentenceCount} sentence${d.sentenceCount !== 1 ? 's' : ''}`);
                })
                .on('mouseout', (event) => {
                    setHoveredTopic(null);
                    d3.select(event.currentTarget)
                        .attr('r', 5)
                        .attr('stroke', '#fff');

                    // Hide tooltip
                    tooltipGroup.style('opacity', 0);
                    tooltipGroup.selectAll('*').remove();
                });
        });

    }, [chartData, colorScale]);

    if (!topics || topics.length === 0) {
        return (
            <div className="radar-chart-empty">
                No topic data available.
            </div>
        );
    }

    return (
        <div ref={containerRef} className="radar-chart">
            {/* Header */}
            <div className="radar-chart-header">
                <h2 className="radar-chart-title">
                    Topic Distribution Radar
                </h2>
                <p className="radar-chart-subtitle">
                    Character count by topic at level {selectedLevel} (Total: {totalAllChars.toLocaleString()} chars)
                </p>
            </div>

            {/* Level Selector */}
            <div className="radar-chart-level-selector">
                <span className="radar-chart-level-label">
                    Topic Level:
                </span>
                <div className="radar-chart-level-buttons">
                    {Array.from({ length: maxLevel + 1 }, (_, i) => (
                        <button
                            key={i}
                            onClick={() => setSelectedLevel(i)}
                            className={`radar-chart-level-btn${selectedLevel === i ? ' active' : ''}`}
                            onMouseEnter={(e) => {
                                if (selectedLevel !== i) {
                                    e.target.classList.add('hover');
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (selectedLevel !== i) {
                                    e.target.classList.remove('hover');
                                }
                            }}
                        >
                            Level {i} ({i === 0 ? 'Main Topics' : i === 1 ? 'Subtopics' : `Depth ${i}`})
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart */}
            <div className="radar-chart-body">
                {chartData.length === 0 ? (
                    <p className="radar-chart-no-data">
                        No data available at level {selectedLevel}. Try selecting a different level.
                    </p>
                ) : (
                    <svg ref={svgRef} className="radar-chart-svg" />
                )}
            </div>

            {/* Legend */}
            {chartData.length > 0 && (
                <div className="radar-chart-legend">
                    {chartData.map((item) => (
                        <div
                            key={item.name}
                            className={`radar-chart-legend-item${hoveredTopic === item ? ' hovered' : ''}`}
                            onMouseEnter={() => setHoveredTopic(item)}
                            onMouseLeave={() => setHoveredTopic(null)}
                        >
                            <div
                                className="radar-chart-legend-color"
                                style={{ backgroundColor: colorScale[item.name] || '#7ba3cc' }}
                            />
                            <span className="radar-chart-legend-name">
                                {item.displayName}
                            </span>
                            <span className="radar-chart-legend-value">
                                ({item.totalChars.toLocaleString()} chars)
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default RadarChart;
