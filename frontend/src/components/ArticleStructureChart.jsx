import React, { useMemo, useState, useRef, useEffect } from 'react';
import '../styles/App.css';

const BASE_COLORS = [
    '#7ba3cc', '#e8a87c', '#85bb65', '#c9a0dc',
    '#d4a5a5', '#a0c4a9', '#cfb997', '#9db4c0',
    '#c2b280', '#b5c7d3', '#d4a76a', '#a5b8d0',
];

const MIN_BLOCK_WIDTH = 120;
const MARGIN = { top: 36, right: 24, bottom: 50, left: 68 };
const SVG_HEIGHT = 380;

function rollingAverage(data, windowSize) {
    const half = Math.floor(windowSize / 2);
    return data.map((_, i) => {
        const start = Math.max(0, i - half);
        const end = Math.min(data.length, i + half + 1);
        const slice = data.slice(start, end);
        return slice.reduce((s, v) => s + v, 0) / slice.length;
    });
}

function ArticleStructureChart({ topics, sentences = [] }) {
    const [selectedLevel, setSelectedLevel] = useState(0);
    const [hoveredTopic, setHoveredTopic] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const [containerWidth, setContainerWidth] = useState(800);
    const containerRef = useRef(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const w = entries[0].contentRect.width;
            if (w > 0) setContainerWidth(w);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const maxLevel = useMemo(() => {
        if (!topics || topics.length === 0) return 0;
        let max = 0;
        topics.forEach(topic => {
            const depth = topic.name.split('>').length - 1;
            if (depth > max) max = depth;
        });
        return max;
    }, [topics]);

    const chartData = useMemo(() => {
        if (!topics || topics.length === 0) return [];
        const levelMap = new Map();
        const hasSentenceText = Array.isArray(sentences) && sentences.length > 0;

        topics.forEach(topic => {
            const parts = topic.name.split('>').map(p => p.trim());
            if (parts.length - 1 < selectedLevel) return;
            const key = parts.slice(0, selectedLevel + 1).join('>');
            if (!levelMap.has(key)) {
                levelMap.set(key, {
                    name: key,
                    displayName: parts[selectedLevel] || key,
                    sentenceIndices: new Set(),
                    fallbackChars: 0,
                });
            }
            const entry = levelMap.get(key);
            const indices = Array.isArray(topic.sentences) ? topic.sentences : [];
            if (indices.length > 0) {
                indices.forEach(idx => {
                    const n = Number(idx);
                    if (Number.isInteger(n) && n > 0) entry.sentenceIndices.add(n);
                });
            } else if (!hasSentenceText && Number.isFinite(topic.totalChars)) {
                entry.fallbackChars += topic.totalChars;
            }
        });

        return Array.from(levelMap.values()).map(entry => {
            let totalChars = 0;
            if (hasSentenceText) {
                entry.sentenceIndices.forEach(n => {
                    const s = sentences[n - 1];
                    if (typeof s === 'string') totalChars += s.length;
                });
            } else {
                totalChars = entry.fallbackChars;
            }
            const indices = Array.from(entry.sentenceIndices);
            const firstSentence = indices.length > 0 ? Math.min(...indices) : Infinity;
            return {
                name: entry.name,
                displayName: entry.displayName,
                totalChars,
                sentenceCount: entry.sentenceIndices.size,
                firstSentence,
            };
        })
            .filter(d => d.sentenceCount > 0 || d.totalChars > 0)
            .sort((a, b) => a.firstSentence - b.firstSentence);
    }, [topics, sentences, selectedLevel]);

    const colorScale = useMemo(() => {
        const colors = {};
        chartData.forEach((item, i) => { colors[item.name] = BASE_COLORS[i % BASE_COLORS.length]; });
        return colors;
    }, [chartData]);

    // Smoothed per-sentence char counts for the line
    const smoothedCounts = useMemo(() => {
        if (!Array.isArray(sentences) || sentences.length === 0) return [];
        const raw = sentences.map(s => typeof s === 'string' ? s.length : 0);
        const windowSize = Math.max(3, Math.round(raw.length / 25));
        return rollingAverage(raw, windowSize);
    }, [sentences]);

    // Layout: blocks filling the plot width proportionally, all same height
    const layout = useMemo(() => {
        if (chartData.length === 0) return { blocks: [], plotWidth: 0 };
        const totalSentences = sentences.length || 1;
        const availableWidth = containerWidth - MARGIN.left - MARGIN.right;

        const widths = chartData.map(d =>
            Math.max((d.sentenceCount / totalSentences) * availableWidth, MIN_BLOCK_WIDTH)
        );
        const totalBlockWidth = widths.reduce((s, w) => s + w, 0);
        const plotWidth = Math.max(totalBlockWidth, availableWidth);

        let x = 0;
        const blocks = chartData.map((d, i) => {
            const w = widths[i];
            const block = { ...d, x, width: w };
            x += w;
            return block;
        });

        return { blocks, plotWidth };
    }, [chartData, containerWidth, sentences.length]);

    const plotHeight = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;
    const svgWidth = layout.plotWidth + MARGIN.left + MARGIN.right;

    // Scales and derived chart elements
    const { linePath, areaPath, yTicks, xTicks } = useMemo(() => {
        const maxVal = smoothedCounts.length > 0 ? Math.max(...smoothedCounts, 1) : 1;
        const n = smoothedCounts.length;

        const xS = i => MARGIN.left + (n > 1 ? (i / (n - 1)) : 0.5) * layout.plotWidth;
        const yS = v => MARGIN.top + plotHeight - (v / maxVal) * plotHeight;

        const pts = smoothedCounts.map((v, i) => ({ x: xS(i), y: yS(v) }));
        const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const area = pts.length
            ? `${line} L${(MARGIN.left + layout.plotWidth).toFixed(1)},${(MARGIN.top + plotHeight).toFixed(1)} L${MARGIN.left},${(MARGIN.top + plotHeight).toFixed(1)} Z`
            : '';

        // Y ticks: 5 levels
        const yTickCount = 5;
        const yTicksArr = Array.from({ length: yTickCount }, (_, i) => {
            const frac = i / (yTickCount - 1);
            const val = Math.round(maxVal * frac);
            return { val, y: yS(val) };
        });

        // X ticks: percentages
        const xTickCount = 7;
        const xTicksArr = Array.from({ length: xTickCount }, (_, i) => {
            const frac = i / (xTickCount - 1);
            return { label: `${Math.round(frac * 100)}%`, x: MARGIN.left + frac * layout.plotWidth };
        });

        return { linePath: line, areaPath: area, yTicks: yTicksArr, xTicks: xTicksArr };
    }, [smoothedCounts, layout.plotWidth, plotHeight]);

    if (!topics || topics.length === 0) {
        return <div className="article-structure-empty">No topic data available.</div>;
    }

    return (
        <div ref={containerRef} className="article-structure-chart">
            {/* Header */}
            <div className="article-structure-header">
                <h2 className="article-structure-title">Article Structure</h2>
                <p className="article-structure-subtitle">
                    Colored bands show topics by order of appearance · Curve shows character density per sentence
                </p>
            </div>

            {/* Level selector */}
            <div className="article-structure-level-selector">
                <span className="article-structure-level-label">Topic Level:</span>
                <div className="article-structure-level-buttons">
                    {Array.from({ length: maxLevel + 1 }, (_, i) => (
                        <button
                            key={i}
                            className={`article-structure-level-btn${selectedLevel === i ? ' active' : ''}`}
                            onClick={() => setSelectedLevel(i)}
                        >
                            Level {i} ({i === 0 ? 'Main Topics' : i === 1 ? 'Subtopics' : `Depth ${i}`})
                        </button>
                    ))}
                </div>
            </div>

            {chartData.length === 0 ? (
                <p className="article-structure-no-data">No data at level {selectedLevel}. Try a different level.</p>
            ) : (
                <div className="article-structure-scroll-container">
                    <svg
                        className="article-structure-main"
                        width={svgWidth}
                        height={SVG_HEIGHT}
                    >
                        {/* ── Background topic bands (all same height) ── */}
                        {layout.blocks.map(block => (
                            <rect
                                key={block.name}
                                x={MARGIN.left + block.x}
                                y={MARGIN.top}
                                width={block.width}
                                height={plotHeight}
                                fill={colorScale[block.name]}
                                opacity={hoveredTopic === block.name ? 0.5 : 0.25}
                                style={{ cursor: 'pointer' }}
                                onMouseEnter={e => {
                                    setHoveredTopic(block.name);
                                    setTooltip({ x: e.clientX, y: e.clientY, data: block });
                                }}
                                onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                                onMouseLeave={() => { setHoveredTopic(null); setTooltip(null); }}
                            />
                        ))}

                        {/* ── Vertical dividers between bands ── */}
                        {layout.blocks.slice(1).map(block => (
                            <line
                                key={`div-${block.name}`}
                                x1={MARGIN.left + block.x} y1={MARGIN.top}
                                x2={MARGIN.left + block.x} y2={MARGIN.top + plotHeight}
                                stroke="#fff" strokeWidth="2"
                                style={{ pointerEvents: 'none' }}
                            />
                        ))}

                        {/* ── Topic labels at top of each band ── */}
                        {layout.blocks.map(block => {
                            const maxChars = Math.max(Math.floor(block.width / 7.5), 4);
                            const label = block.displayName.length > maxChars
                                ? block.displayName.slice(0, maxChars - 1) + '…'
                                : block.displayName;
                            return block.width >= 32 ? (
                                <text
                                    key={`lbl-${block.name}`}
                                    x={MARGIN.left + block.x + block.width / 2}
                                    y={MARGIN.top + 16}
                                    textAnchor="middle"
                                    fontSize={block.width > 100 ? 12 : 10}
                                    fontWeight="700"
                                    fill={colorScale[block.name]}
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                >
                                    {label}
                                </text>
                            ) : null;
                        })}

                        {/* ── Horizontal grid lines (dashed) ── */}
                        {yTicks.map(({ y }, i) => (
                            <line
                                key={`grid-${i}`}
                                x1={MARGIN.left} y1={y}
                                x2={MARGIN.left + layout.plotWidth} y2={y}
                                stroke="#ccc" strokeWidth="1" strokeDasharray="4,3"
                                style={{ pointerEvents: 'none' }}
                            />
                        ))}

                        {/* ── Y axis ── */}
                        <line
                            x1={MARGIN.left} y1={MARGIN.top}
                            x2={MARGIN.left} y2={MARGIN.top + plotHeight}
                            stroke="#bbb" strokeWidth="1"
                        />
                        {yTicks.map(({ val, y }, i) => (
                            <g key={`ytick-${i}`}>
                                <line x1={MARGIN.left - 5} y1={y} x2={MARGIN.left} y2={y} stroke="#bbb" strokeWidth="1" />
                                <text x={MARGIN.left - 9} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#777">
                                    {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                                </text>
                            </g>
                        ))}
                        {/* Y axis label */}
                        <text
                            x={14}
                            y={MARGIN.top + plotHeight / 2}
                            textAnchor="middle"
                            fontSize="10"
                            fill="#999"
                            transform={`rotate(-90, 14, ${MARGIN.top + plotHeight / 2})`}
                        >
                            chars / sentence
                        </text>

                        {/* ── X axis ── */}
                        <line
                            x1={MARGIN.left} y1={MARGIN.top + plotHeight}
                            x2={MARGIN.left + layout.plotWidth} y2={MARGIN.top + plotHeight}
                            stroke="#bbb" strokeWidth="1"
                        />
                        {xTicks.map(({ label, x }, i) => (
                            <g key={`xtick-${i}`}>
                                <line x1={x} y1={MARGIN.top + plotHeight} x2={x} y2={MARGIN.top + plotHeight + 5} stroke="#bbb" strokeWidth="1" />
                                <text x={x} y={MARGIN.top + plotHeight + 17} textAnchor="middle" fontSize="10" fill="#777">
                                    {label}
                                </text>
                            </g>
                        ))}
                        <text
                            x={MARGIN.left + layout.plotWidth / 2}
                            y={SVG_HEIGHT - 6}
                            textAnchor="middle"
                            fontSize="10"
                            fill="#aaa"
                        >
                            Article position
                        </text>

                        {/* ── Line chart: area fill + curve ── */}
                        {areaPath && (
                            <path
                                d={areaPath}
                                fill="rgba(44, 62, 80, 0.08)"
                                style={{ pointerEvents: 'none' }}
                            />
                        )}
                        {linePath && (
                            <path
                                d={linePath}
                                fill="none"
                                stroke="#2c3e50"
                                strokeWidth="2.2"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                style={{ pointerEvents: 'none' }}
                            />
                        )}
                    </svg>
                </div>
            )}

            {/* Legend */}
            {chartData.length > 0 && (
                <div className="article-structure-legend">
                    {chartData.map(item => (
                        <div
                            key={item.name}
                            className={`article-structure-legend-item${hoveredTopic === item.name ? ' hovered' : ''}`}
                            onMouseEnter={() => setHoveredTopic(item.name)}
                            onMouseLeave={() => setHoveredTopic(null)}
                        >
                            <div className="article-structure-legend-color" style={{ backgroundColor: colorScale[item.name] }} />
                            <span className="article-structure-legend-name">{item.displayName}</span>
                            <span className="article-structure-legend-value">({item.totalChars.toLocaleString()} chars)</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="article-structure-tooltip"
                    style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
                >
                    <div className="article-structure-tooltip-name">{tooltip.data.name}</div>
                    <div className="article-structure-tooltip-stats">
                        {tooltip.data.totalChars.toLocaleString()} chars &bull; {tooltip.data.sentenceCount} sentence{tooltip.data.sentenceCount !== 1 ? 's' : ''}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ArticleStructureChart;
