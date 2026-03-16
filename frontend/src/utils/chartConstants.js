export const BASE_COLORS = [
    '#7ba3cc', '#e8a87c', '#85bb65', '#c9a0dc',
    '#d4a5a5', '#a0c4a9', '#cfb997', '#9db4c0',
    '#c2b280', '#b5c7d3', '#d4a76a', '#a5b8d0',
];

export function getTopicSelectionKey(topicOrTopics) {
    if (!topicOrTopics) return '';
    if (Array.isArray(topicOrTopics)) {
        return topicOrTopics
            .map(topic => topic?.name)
            .filter(Boolean)
            .sort()
            .join('|');
    }
    return topicOrTopics.name || '';
}

export function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}
