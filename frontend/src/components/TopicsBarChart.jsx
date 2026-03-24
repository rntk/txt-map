import React, { useEffect, useMemo, useState } from 'react';
import './TopicsBarChart.css';
import TopicSentencesModal from './shared/TopicSentencesModal';
import TopicLevelSwitcher from './shared/TopicLevelSwitcher';
import Breadcrumbs from './shared/Breadcrumbs';
import { useTopicLevel } from '../hooks/useTopicLevel';
import { useScopeNavigation } from '../hooks/useScopeNavigation';
import {
    buildScopedChartData,
    getDirectChildLabels,
    getLevelLabel,
    getScopeLabel,
    hasDeeperChildren,
    sanitizePathForTestId,
} from '../utils/topicHierarchy';

const BASE_COLORS = [
    '#a8c4d8',
    '#c4a882',
    '#9ab8a0',
    '#d4917a',
    '#5a5a5a',
    '#b8a9c8',
    '#c9b458',
    '#8aafaf',
    '#c48e8e',
    '#8b9dc3',
];

/**
 * TopicsBarChart
 * - Creates one bar for the current scope and relative topic level
 * - Bar width is based on sentence character count
 * - Infographic style: bars sorted smallest-to-largest (top to bottom),
 *   value inside bar, label to the right
 * - Click a drillable topic to navigate into its subtopics
 */
function TopicsBarChart({
    topics,
    sentences = [],
    onShowInArticle,
    readTopics,
    onToggleRead,
    markup,
}) {
    const [hoveredBar, setHoveredBar] = useState(null);
    const { scopePath, navigateTo, drillInto } = useScopeNavigation();
    const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(topics, scopePath);
    const [modalTopic, setModalTopic] = useState(null);
    const MAX_BAR_WIDTH_PERCENT = 78;

    useEffect(() => {
        setHoveredBar(null);
    }, [scopePath, selectedLevel]);

    const chartData = useMemo(() => {
        const scopedData = buildScopedChartData(topics, sentences, scopePath, selectedLevel);

        return scopedData
            .map(item => ({
                ...item,
                childLabels: getDirectChildLabels(topics, item.fullPath),
                isDrillable: hasDeeperChildren(topics, item.fullPath),
            }))
            .sort((a, b) => a.totalChars - b.totalChars || a.fullPath.localeCompare(b.fullPath));
    }, [topics, sentences, scopePath, selectedLevel]);

    const maxChars = useMemo(() => {
        if (chartData.length === 0) return 100;
        const max = Math.max(...chartData.map(d => d.totalChars));
        return max > 0 ? max : 1;
    }, [chartData]);

    const colorScale = useMemo(() => {
        const colors = {};
        chartData.forEach((item, index) => {
            colors[item.fullPath] = BASE_COLORS[index % BASE_COLORS.length];
        });
        return colors;
    }, [chartData]);

    const totalAllChars = useMemo(() => {
        return chartData.reduce((sum, item) => sum + item.totalChars, 0);
    }, [chartData]);

    const scopeLabel = getScopeLabel(scopePath);
    const scopeCopy = scopePath.length === 0
        ? `Showing all topics at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}).`
        : `Inside ${scopeLabel} at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}).`;

    const handleRowClick = item => {
        if (!item.isDrillable) return;
        drillInto(item.fullPath);
        setSelectedLevel(0);
    };

    const handleOpenModal = item => {
        setModalTopic({
            displayName: item.displayName,
            fullPath: item.fullPath,
            sentenceIndices: item.sentenceIndices || [],
        });
    };

    if (!topics || topics.length === 0) {
        return (
            <div className="topics-bar-chart-empty-state">
                No topic data available.
            </div>
        );
    }

    return (
        <div className="topics-bar-chart">
            <div className="topics-bar-chart__header">
                <h2 className="topics-bar-chart__title">Topics Overview</h2>
                <p className="topics-bar-chart__subtitle">
                    Character count by topic. Click a topic to drill into its subtopics.
                </p>
                <div className="topics-bar-chart__total">
                    Total: {totalAllChars.toLocaleString()} characters
                </div>
            </div>

            <div className="topics-bar-chart__controls">
                <Breadcrumbs scopePath={scopePath} onNavigate={navigateTo} classPrefix="topics-bar-chart__" />

                <TopicLevelSwitcher
                    selectedLevel={selectedLevel}
                    maxLevel={maxLevel}
                    onChange={setSelectedLevel}
                />

                <p className="topics-bar-chart__scope-copy">{scopeCopy}</p>
            </div>

            {chartData.length === 0 ? (
                <p className="topics-bar-chart__no-data">
                    No topics found inside {scopeLabel} at relative level {selectedLevel}. Try a different level or use the breadcrumbs.
                </p>
            ) : (
                <>
                    <div className="topics-bar-chart__body" data-testid="topics-bar-chart-scroll">
                        {chartData.map((item, index) => {
                            const scaledBarWidthPercent = (item.totalChars / maxChars) * MAX_BAR_WIDTH_PERCENT;
                            const barWidthPercent = Math.max(scaledBarWidthPercent, 8);
                            const color = colorScale[item.fullPath] || '#999';
                            const isHovered = hoveredBar === index;
                            const isLast = index === chartData.length - 1;

                            return (
                                <div
                                    key={item.fullPath}
                                    className={`topics-bar-chart__row${isLast ? ' topics-bar-chart__row--last' : ''}${item.isDrillable ? ' topics-bar-chart__row--drillable' : ''}`}
                                    onMouseEnter={() => setHoveredBar(index)}
                                    onMouseLeave={() => setHoveredBar(null)}
                                >
                                    <button
                                        type="button"
                                        className="topics-bar-chart__row-main"
                                        data-testid={`topics-bar-chart-row-${sanitizePathForTestId(item.fullPath)}`}
                                        aria-label={item.fullPath}
                                        aria-disabled={item.isDrillable ? undefined : 'true'}
                                        onClick={() => handleRowClick(item)}
                                        title={item.fullPath}
                                    >
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

                                        <div className="topics-bar-chart__label-group">
                                            <div className="topics-bar-chart__label">{item.displayName}</div>
                                            {item.childLabels.length > 0 && (
                                                <div className="topics-bar-chart__deeper-topics">
                                                    ({item.childLabels.join(', ')})
                                                </div>
                                            )}
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        className="topics-bar-chart__row-action"
                                        aria-label={`View sentences for ${item.displayName}`}
                                        onClick={() => handleOpenModal(item)}
                                    >
                                        <span />
                                        <span />
                                        <span />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <div className="topics-bar-chart__legend">
                        {chartData.map(item => (
                            <div key={item.fullPath} className="topics-bar-chart__legend-item">
                                <div
                                    className="topics-bar-chart__legend-swatch"
                                    style={{ backgroundColor: colorScale[item.fullPath] }}
                                />
                                <span className="topics-bar-chart__legend-label">{item.displayName}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {modalTopic && (
                <TopicSentencesModal
                    topic={modalTopic}
                    sentences={sentences}
                    onClose={() => setModalTopic(null)}
                    onShowInArticle={onShowInArticle}
                    readTopics={readTopics}
                    onToggleRead={onToggleRead}
                    markup={markup}
                />
            )}
        </div>
    );
}

export default TopicsBarChart;
