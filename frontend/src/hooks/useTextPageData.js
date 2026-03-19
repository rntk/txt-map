import { useMemo } from 'react';
import { buildTopicStateRanges } from '../utils/textHighlight';
import { buildSummaryTimelineItems } from '../utils/summaryTimeline';
import { matchSummaryToTopics } from '../utils/summaryMatcher';

export function useTextPageData(submission, selectedTopics, hoveredTopic, readTopics) {
    const results = submission?.results || {};
    const safeTopics = Array.isArray(results.topics) ? results.topics : [];
    const rawText = submission?.text_content || '';
    const articleSummary = results.article_summary && typeof results.article_summary === 'object'
        ? results.article_summary
        : {};
    const articleSummaryText = typeof articleSummary.text === 'string' ? articleSummary.text : '';
    const articleSummaryBullets = Array.isArray(articleSummary.bullets)
        ? articleSummary.bullets.filter((bullet) => typeof bullet === 'string' && bullet.trim())
        : [];

    const topicSummaryParaMap = useMemo(() => {
        const mappings = results.summary_mappings;
        if (!Array.isArray(mappings) || mappings.length === 0) return {};
        const map = {};
        for (const topic of safeTopics) {
            if (!topic.name || !Array.isArray(topic.sentences)) continue;
            const topicSentenceSet = new Set(topic.sentences);
            const paraIndices = [];
            for (const mapping of mappings) {
                if (!Array.isArray(mapping.source_sentences)) continue;
                if (mapping.source_sentences.some(s => topicSentenceSet.has(s))) {
                    paraIndices.push(mapping.summary_index);
                }
            }
            if (paraIndices.length > 0) {
                map[topic.name] = paraIndices;
            }
        }
        return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results, safeTopics]);

    const allTopics = useMemo(() => safeTopics.map(topic => ({
        ...topic,
        totalSentences: topic.sentences ? topic.sentences.length : 0,
        summary: results.topic_summaries ? results.topic_summaries[topic.name] : ''
    })), [safeTopics, results.topic_summaries]);

    const { highlightRanges: rawTextHighlightRanges, fadeRanges: rawTextFadeRanges } = useMemo(
        () => buildTopicStateRanges(safeTopics, selectedTopics, hoveredTopic, readTopics, rawText.length),
        [safeTopics, selectedTopics, hoveredTopic, readTopics, rawText.length]
    );

    const highlightedSummaryParas = useMemo(() => {
        const set = new Set();
        for (const topic of selectedTopics) {
            const indices = topicSummaryParaMap[topic.name];
            if (Array.isArray(indices)) {
                for (const idx of indices) set.add(idx);
            }
        }
        return set;
    }, [selectedTopics, topicSummaryParaMap]);

    const articles = useMemo(() => {
        const safeSentences = Array.isArray(results.sentences) ? results.sentences : [];
        if (safeSentences.length === 0) return [];
        return [{
            sentences: safeSentences,
            topics: safeTopics,
            topic_summaries: results.topic_summaries || {},
            paragraph_map: results.paragraph_map || null,
            raw_html: submission?.html_content || '',
            marker_word_indices: Array.isArray(results.marker_word_indices) ? results.marker_word_indices : []
        }];
    }, [submission, safeTopics, results]);

    const summaryTimelineItems = useMemo(() => {
        return buildSummaryTimelineItems(results.summary, results.summary_mappings, safeTopics);
    }, [results, safeTopics]);

    const articleBulletMatches = useMemo(() => {
        if (!articleSummaryBullets.length || !safeTopics.length) return [];
        const sentences = Array.isArray(results.sentences) ? results.sentences : [];
        return articleSummaryBullets.map(bullet =>
            matchSummaryToTopics(bullet, safeTopics, sentences)
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [articleSummaryBullets, safeTopics, results.sentences]);

    const articleTextMatches = useMemo(() => {
        if (!articleSummaryText || !safeTopics.length) return [];
        const sentences = Array.isArray(results.sentences) ? results.sentences : [];
        return matchSummaryToTopics(articleSummaryText, safeTopics, sentences);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [articleSummaryText, safeTopics, results.sentences]);

    return {
        safeTopics,
        rawText,
        articleSummaryText,
        articleSummaryBullets,
        topicSummaryParaMap,
        allTopics,
        rawTextHighlightRanges,
        rawTextFadeRanges,
        highlightedSummaryParas,
        articles,
        summaryTimelineItems,
        articleBulletMatches,
        articleTextMatches,
    };
}
