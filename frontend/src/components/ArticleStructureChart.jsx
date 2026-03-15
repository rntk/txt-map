import React, { useMemo, useState, useRef, useEffect } from 'react';
import '../styles/App.css';
import TopicLevelSwitcher from './shared/TopicLevelSwitcher';
import {
    buildScopedChartData,
    getLevelLabel,
    getScopeLabel,
    getScopedMaxLevel,
    getTopicParts,
    hasDeeperChildren,
    sanitizePathForTestId,
} from '../utils/topicHierarchy';

export { buildScopedChartData, getScopedMaxLevel };

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

function Breadcrumbs({ scopePath, onNavigate }) {
    return (
        <div className="article-structure-breadcrumbs">
            <button
                type="button"
                className={`article-structure-breadcrumb-link${scopePath.length === 0 ? ' current' : ''}`}
                onClick={() => onNavigate([])}
                disabled={scopePath.length === 0}
            >
                All Topics
            </button>
            {scopePath.map((segment, index) => {
                const isCurrent = index === scopePath.length - 1;
                return (
                    <React.Fragment key={`${segment}-${index}`}>
                        <span className="article-structure-breadcrumb-separator">&gt;</span>
                        <button
                            type="button"
                            className={`article-structure-breadcrumb-link${isCurrent ? ' current' : ''}`}
                            onClick={() => onNavigate(scopePath.slice(0, index + 1))}
                            disabled={isCurrent}
                        >
                            {segment}
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

function TopicSentencesModal({ topic, sentences, onClose }) {
    useEffect(() => {
        const handleKey = e => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    if (!topic) return null;

    const sortedIndices = [...topic.sentenceIndices].sort((a, b) => a - b);

    return (
        <div
            className="article-structure-modal-overlay"
            onClick={onClose}
        >
            <div
                className="article-structure-modal"
                onClick={e => e.stopPropagation()}
            >
                <div className="article-structure-modal-header">
                    <h3>{topic.displayName}</h3>
                    <div className="article-structure-modal-toolbar" />
                    <button
                        type="button"
                        className="article-structure-modal-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>
                <div className="article-structure-modal-body">
                    {sortedIndices.length === 0 ? (
                        <p>No sentences found for this topic.</p>
                    ) : (
                        sortedIndices.map(idx => {
                            const text = sentences[idx - 1];
                            return (
                                <div key={idx} className="article-structure-modal-sentence">
                                    <span className="article-structure-modal-sentence-num">{idx}.</span>
                                    <span className="article-structure-modal-sentence-text">{text || ''}</span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

function ArticleStructureChart({ topics, sentences = [] }) {
    const [selectedLevel, setSelectedLevel] = useState(0);
    const [scopePath, setScopePath] = useState([]);
    const [hoveredTopic, setHoveredTopic] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const [containerWidth, setContainerWidth] = useState(800);
    const [modalTopic, setModalTopic] = useState(null);
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

    const maxLevel = useMemo(() => getScopedMaxLevel(topics, scopePath), [topics, scopePath]);

    useEffect(() => {
        if (selectedLevel > maxLevel) {
            setSelectedLevel(maxLevel);
        }
    }, [selectedLevel, maxLevel]);

    useEffect(() => {
        setHoveredTopic(null);
        setTooltip(null);
    }, [scopePath, selectedLevel]);

    const chartData = useMemo(
        () => buildScopedChartData(topics, sentences, scopePath, selectedLevel),
        [topics, sentences, scopePath, selectedLevel]
    );

    const colorScale = useMemo(() => {
        const colors = {};
        chartData.forEach((item, i) => {
            colors[item.fullPath] = BASE_COLORS[i % BASE_COLORS.length];
        });
        return colors;
    }, [chartData]);

    const smoothedCounts = useMemo(() => {
        if (!Array.isArray(sentences) || sentences.length === 0) return [];
        const raw = sentences.map(s => typeof s === 'string' ? s.length : 0);
        const windowSize = Math.max(3, Math.round(raw.length / 25));
        return rollingAverage(raw, windowSize);
    }, [sentences]);

    const layout = useMemo(() => {
        if (chartData.length === 0) return { blocks: [], plotWidth: 0 };
        const totalSentences = sentences.length || 1;
        const availableWidth = containerWidth - MARGIN.left - MARGIN.right;

        const widths = chartData.map(item =>
            Math.max((item.sentenceCount / totalSentences) * availableWidth, MIN_BLOCK_WIDTH)
        );
        const totalBlockWidth = widths.reduce((sum, width) => sum + width, 0);
        const plotWidth = Math.max(totalBlockWidth, availableWidth);

        let x = 0;
        const blocks = chartData.map((item, index) => {
            const width = widths[index];
            const isDrillable = hasDeeperChildren(topics, item.fullPath);
            const block = { ...item, x, width, isDrillable };
            x += width;
            return block;
        });

        return { blocks, plotWidth };
    }, [chartData, containerWidth, sentences.length, topics]);

    const plotHeight = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;
    const svgWidth = layout.plotWidth + MARGIN.left + MARGIN.right;

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

        const yTickCount = 5;
        const yTicksArr = Array.from({ length: yTickCount }, (_, i) => {
            const frac = i / (yTickCount - 1);
            const val = Math.round(maxVal * frac);
            return { val, y: yS(val) };
        });

        const xTickCount = 7;
        const xTicksArr = Array.from({ length: xTickCount }, (_, i) => {
            const frac = i / (xTickCount - 1);
            return { label: `${Math.round(frac * 100)}%`, x: MARGIN.left + frac * layout.plotWidth };
        });

        return { linePath: line, areaPath: area, yTicks: yTicksArr, xTicks: xTicksArr };
    }, [smoothedCounts, layout.plotWidth, plotHeight]);

    const scopeLabel = getScopeLabel(scopePath);

    const subtitle = scopePath.length === 0
        ? `Showing all topics at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}).`
        : `Inside ${scopeLabel} at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}).`;

    const handleNavigate = nextScopePath => {
        setScopePath(nextScopePath);
    };

    const handleBlockClick = block => {
        if (!block.isDrillable) return;
        setScopePath(getTopicParts(block.fullPath));
        setSelectedLevel(0);
    };

    if (!topics || topics.length === 0) {
        return <div className="article-structure-empty">No topic data available.</div>;
    }

    return (
        <div ref={containerRef} className="article-structure-chart">
            <div className="article-structure-header">
                <h2 className="article-structure-title">Article Structure</h2>
                <p className="article-structure-subtitle">
                    Colored bands show topics by order of appearance. Click a topic to drill into its subtopics.
                </p>
            </div>

            <div className="article-structure-controls">
                <Breadcrumbs scopePath={scopePath} onNavigate={handleNavigate} />

                <TopicLevelSwitcher
                    selectedLevel={selectedLevel}
                    maxLevel={maxLevel}
                    onChange={setSelectedLevel}
                />

                <p className="article-structure-scope-copy">{subtitle}</p>
            </div>

            {chartData.length === 0 ? (
                <p className="article-structure-no-data">
                    No topics found inside {scopeLabel} at relative level {selectedLevel}. Try a different level or use the breadcrumbs.
                </p>
            ) : (
                <div className="article-structure-scroll-container">
                    <svg
                        className="article-structure-main"
                        width={svgWidth}
                        height={SVG_HEIGHT}
                    >
                        {layout.blocks.map(block => (
                            <rect
                                key={block.fullPath}
                                x={MARGIN.left + block.x}
                                y={MARGIN.top}
                                width={block.width}
                                height={plotHeight}
                                fill={colorScale[block.fullPath]}
                                opacity={hoveredTopic === block.fullPath ? 0.5 : 0.25}
                                className={`article-structure-band${block.isDrillable ? ' drillable' : ''}`}
                                data-testid={`article-structure-block-${sanitizePathForTestId(block.fullPath)}`}
                                aria-label={block.fullPath}
                                style={{ cursor: block.isDrillable ? 'pointer' : 'default' }}
                                onClick={() => handleBlockClick(block)}
                                onMouseEnter={e => {
                                    setHoveredTopic(block.fullPath);
                                    setTooltip({ x: e.clientX, y: e.clientY, data: block });
                                }}
                                onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                                onMouseLeave={() => {
                                    setHoveredTopic(null);
                                    setTooltip(null);
                                }}
                            />
                        ))}

                        {layout.blocks.slice(1).map(block => (
                            <line
                                key={`div-${block.fullPath}`}
                                x1={MARGIN.left + block.x}
                                y1={MARGIN.top}
                                x2={MARGIN.left + block.x}
                                y2={MARGIN.top + plotHeight}
                                stroke="#fff"
                                strokeWidth="2"
                                style={{ pointerEvents: 'none' }}
                            />
                        ))}

                        {layout.blocks.map(block => {
                            const maxChars = Math.max(Math.floor(block.width / 7.5), 4);
                            const label = block.displayName.length > maxChars
                                ? block.displayName.slice(0, maxChars - 1) + '...'
                                : block.displayName;

                            if (block.width < 32) return null;

                            const cx = MARGIN.left + block.x + block.width / 2;
                            const cy = MARGIN.top + 16;
                            const showMenu = block.width >= 60;
                            const btnX = cx;
                            const btnY = MARGIN.top + 34;
                            const fontSize = block.width > 100 ? 12 : 10;

                            return (
                                <g key={`lbl-${block.fullPath}`}>
                                    <text
                                        x={cx}
                                        y={cy}
                                        textAnchor="middle"
                                        fontSize={fontSize}
                                        fontWeight="800"
                                        fill={colorScale[block.fullPath]}
                                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                        {label}
                                    </text>
                                    {showMenu && (
                                        <g
                                            className="article-structure-menu-btn"
                                            transform={`translate(${btnX}, ${btnY})`}
                                            onClick={e => {
                                                e.stopPropagation();
                                                setModalTopic({
                                                    displayName: block.displayName,
                                                    fullPath: block.fullPath,
                                                    sentenceIndices: block.sentenceIndices || [],
                                                });
                                            }}
                                            style={{ cursor: 'pointer' }}
                                            aria-label={`View sentences for ${block.displayName}`}
                                        >
                                            <rect x="-8" y="-4" width="16" height="18" rx="3" fill="rgba(255,255,255,0.7)" />
                                            <line x1="-5" y1="0" x2="5" y2="0" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
                                            <line x1="-5" y1="4" x2="5" y2="4" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
                                            <line x1="-5" y1="8" x2="5" y2="8" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        {yTicks.map(({ y }, i) => (
                            <line
                                key={`grid-${i}`}
                                x1={MARGIN.left}
                                y1={y}
                                x2={MARGIN.left + layout.plotWidth}
                                y2={y}
                                stroke="#ccc"
                                strokeWidth="1"
                                strokeDasharray="4,3"
                                style={{ pointerEvents: 'none' }}
                            />
                        ))}

                        <line
                            x1={MARGIN.left}
                            y1={MARGIN.top}
                            x2={MARGIN.left}
                            y2={MARGIN.top + plotHeight}
                            stroke="#bbb"
                            strokeWidth="1"
                        />
                        {yTicks.map(({ val, y }, i) => (
                            <g key={`ytick-${i}`}>
                                <line x1={MARGIN.left - 5} y1={y} x2={MARGIN.left} y2={y} stroke="#bbb" strokeWidth="1" />
                                <text x={MARGIN.left - 9} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#777">
                                    {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                                </text>
                            </g>
                        ))}
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

                        <line
                            x1={MARGIN.left}
                            y1={MARGIN.top + plotHeight}
                            x2={MARGIN.left + layout.plotWidth}
                            y2={MARGIN.top + plotHeight}
                            stroke="#bbb"
                            strokeWidth="1"
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

            {chartData.length > 0 && (
                <div className="article-structure-legend">
                    {chartData.map(item => (
                        <div
                            key={item.fullPath}
                            className={`article-structure-legend-item${hoveredTopic === item.fullPath ? ' hovered' : ''}`}
                            onMouseEnter={() => setHoveredTopic(item.fullPath)}
                            onMouseLeave={() => setHoveredTopic(null)}
                        >
                            <div className="article-structure-legend-color" style={{ backgroundColor: colorScale[item.fullPath] }} />
                            <span className="article-structure-legend-name">{item.displayName}</span>
                            <span className="article-structure-legend-value">({item.totalChars.toLocaleString()} chars)</span>
                        </div>
                    ))}
                </div>
            )}

            {tooltip && (
                <div
                    className="article-structure-tooltip"
                    style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
                >
                    <div className="article-structure-tooltip-name">{tooltip.data.fullPath}</div>
                    <div className="article-structure-tooltip-stats">
                        {tooltip.data.totalChars.toLocaleString()} chars &bull; {tooltip.data.sentenceCount} sentence{tooltip.data.sentenceCount !== 1 ? 's' : ''}
                    </div>
                </div>
            )}

            {modalTopic && (
                <TopicSentencesModal
                    topic={modalTopic}
                    sentences={sentences}
                    onClose={() => setModalTopic(null)}
                />
            )}
        </div>
    );
}

export default ArticleStructureChart;
