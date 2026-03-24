import React, { useMemo, useState } from 'react';
import MarimekkoChart from './MarimekkoChart';
import Breadcrumbs from './shared/Breadcrumbs';
import TopicLevelSwitcher from './shared/TopicLevelSwitcher';
import TopicSentencesModal from './shared/TopicSentencesModal';
import { useScopeNavigation } from '../hooks/useScopeNavigation';
import { useTopicLevel } from '../hooks/useTopicLevel';
import { useContainerSize } from '../hooks/useContainerSize';
import { buildScopedChartData, getTopicParts, hasDeeperChildren } from '../utils/topicHierarchy';
import '../styles/marimekko.css';

const MarimekkoChartTab = ({
    topics,
    sentences,
    onShowInArticle,
    readTopics,
    onToggleRead,
    markup,
}) => {
    const { scopePath, navigateTo, drillInto } = useScopeNavigation();
    const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(topics, scopePath);
    const { containerRef, containerSize } = useContainerSize(900);
    const [modalTopic, setModalTopic] = useState(null);

    const safeTopics = useMemo(() => (Array.isArray(topics) ? topics : []), [topics]);
    const safeSentences = useMemo(() => (Array.isArray(sentences) ? sentences : []), [sentences]);

    const columns = useMemo(() => {
        const colItems = buildScopedChartData(safeTopics, safeSentences, scopePath, selectedLevel);

        return colItems.map(col => {
            const colScope = getTopicParts(col.fullPath);
            const rowItems = buildScopedChartData(safeTopics, safeSentences, colScope, 0);

            const rows = rowItems.length > 0
                ? rowItems.map(r => ({
                    ...r,
                    isDrillable: hasDeeperChildren(safeTopics, r.fullPath),
                }))
                : [{ ...col, isDrillable: false }];

            return {
                ...col,
                rows,
                isDrillable: hasDeeperChildren(safeTopics, col.fullPath),
            };
        });
    }, [safeTopics, safeSentences, scopePath, selectedLevel]);

    const handleBarClick = (item) => {
        if (item.isDrillable) {
            drillInto(item.fullPath);
        } else {
            setModalTopic(item);
        }
    };

    return (
        <div className="marimekko-tab">
            <div className="marimekko-tab__controls">
                <Breadcrumbs
                    scopePath={scopePath}
                    onNavigate={navigateTo}
                    classPrefix="marimekko-"
                />
                {maxLevel > 0 && (
                    <TopicLevelSwitcher
                        selectedLevel={selectedLevel}
                        maxLevel={maxLevel}
                        onChange={setSelectedLevel}
                        label="Column Level:"
                    />
                )}
            </div>

            <div className="marimekko-tab__chart-wrapper" ref={containerRef}>
                {columns.length > 0 ? (
                    <MarimekkoChart
                        columns={columns}
                        containerWidth={containerSize}
                        onBarClick={handleBarClick}
                    />
                ) : (
                    <div style={{ color: '#888', padding: '20px' }}>No topics to display.</div>
                )}
            </div>

            {modalTopic && (
                <TopicSentencesModal
                    topic={modalTopic}
                    sentences={safeSentences}
                    onClose={() => setModalTopic(null)}
                    onShowInArticle={onShowInArticle}
                    readTopics={readTopics}
                    onToggleRead={onToggleRead}
                    markup={markup}
                />
            )}
        </div>
    );
};

export default MarimekkoChartTab;
