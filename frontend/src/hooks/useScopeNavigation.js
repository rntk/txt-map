import { useState } from 'react';
import { getTopicParts } from '../utils/topicHierarchy';

export function useScopeNavigation() {
    const [scopePath, setScopePath] = useState([]);

    const navigateTo = (newPath) => {
        setScopePath(newPath);
    };

    const drillInto = (fullPath) => {
        setScopePath(getTopicParts(fullPath));
    };

    return { scopePath, setScopePath, navigateTo, drillInto };
}
