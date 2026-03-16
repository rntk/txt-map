import { useState, useEffect, useMemo } from 'react';
import { getScopedMaxLevel } from '../utils/topicHierarchy';

export function useTopicLevel(topics, scopePath = []) {
    const [selectedLevel, setSelectedLevel] = useState(0);

    const maxLevel = useMemo(() => getScopedMaxLevel(topics, scopePath), [topics, scopePath]);

    useEffect(() => {
        if (selectedLevel > maxLevel) {
            setSelectedLevel(maxLevel);
        }
    }, [selectedLevel, maxLevel]);

    return { selectedLevel, setSelectedLevel, maxLevel };
}
