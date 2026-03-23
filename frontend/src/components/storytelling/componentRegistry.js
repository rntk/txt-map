import TreemapChart from '../TreemapChart';
import ArticleStructureChart from '../ArticleStructureChart';
import TopicsRiverChart from '../TopicsRiverChart';
import TopicsBarChart from '../TopicsBarChart';
import TopicsTagCloud from '../TopicsTagCloud';
import CircularPackingChart from '../CircularPackingChart';
import RadarChart from '../RadarChart';
import MarimekkoChartTab from '../MarimekkoChartTab';
import MindmapResults from '../MindmapResults';
import DataChartOverview from '../annotations/charts/DataChartOverview';

/**
 * Topic-structure chart names — selected randomly by the frontend, not by the LLM.
 * These visualize the topic structure in various ways; all work regardless of content.
 */
export const TOPIC_CHART_NAMES = [
  'TreemapChart',
  'ArticleStructureChart',
  'TopicsRiverChart',
  'TopicsBarChart',
  'TopicsTagCloud',
  'CircularPackingChart',
  'RadarChart',
  'MarimekkoChartTab',
  'MindmapResults',
];

/** Data-driven chart names — selected by the LLM when the article has quantitative data. */
export const DATA_CHART_NAMES = new Set(['DataBarChart', 'DataLineChart', 'DataTimelineChart']);

/**
 * Registry mapping LLM-output component names to actual React components.
 * dataNeeds lists the keys required from the submission data context.
 */
export const COMPONENT_REGISTRY = {
  TreemapChart: {
    component: TreemapChart,
    dataNeeds: ['topics', 'sentences'],
  },
  ArticleStructureChart: {
    component: ArticleStructureChart,
    dataNeeds: ['topics', 'sentences'],
  },
  TopicsRiverChart: {
    component: TopicsRiverChart,
    dataNeeds: ['topics', 'sentences'],
  },
  TopicsBarChart: {
    component: TopicsBarChart,
    dataNeeds: ['topics', 'sentences'],
  },
  TopicsTagCloud: {
    component: TopicsTagCloud,
    dataNeeds: ['submissionId', 'topics', 'sentences'],
  },
  CircularPackingChart: {
    component: CircularPackingChart,
    dataNeeds: ['topics', 'sentences'],
  },
  RadarChart: {
    component: RadarChart,
    dataNeeds: ['topics', 'sentences'],
  },
  MarimekkoChartTab: {
    component: MarimekkoChartTab,
    dataNeeds: ['topics', 'sentences'],
  },
  MindmapResults: {
    component: MindmapResults,
    dataNeeds: ['mindmapData'],
  },
  // Data-driven charts — render extractions matching their chart type
  DataBarChart: {
    component: DataChartOverview,
    dataNeeds: ['dataExtractions'],
    chartType: 'bar',
  },
  DataLineChart: {
    component: DataChartOverview,
    dataNeeds: ['dataExtractions'],
    chartType: 'line',
  },
  DataTimelineChart: {
    component: DataChartOverview,
    dataNeeds: ['dataExtractions'],
    chartType: 'timeline',
  },
};

const MIN_FILTERED_TOPICS = 2;

/**
 * Pre-filter topics based on LLM-specified chart filter hints.
 * Falls back to the full list if filtering yields fewer than MIN_FILTERED_TOPICS.
 */
export function filterTopics(topics, chartSpec) {
  if (!chartSpec || !Array.isArray(topics) || topics.length === 0) return topics;

  let filtered = topics;

  if (Array.isArray(chartSpec.topic_filter) && chartSpec.topic_filter.length > 0) {
    const allowSet = new Set(chartSpec.topic_filter);
    filtered = topics.filter(t => allowSet.has(t.name));
  } else if (typeof chartSpec.scope === 'string' && chartSpec.scope.length > 0) {
    const prefix = chartSpec.scope;
    filtered = topics.filter(t => {
      const name = t.name || '';
      return name === prefix || name.startsWith(prefix + ' > ');
    });
  }

  return filtered.length >= MIN_FILTERED_TOPICS ? filtered : topics;
}

/**
 * Assemble props for a chart component from submission data context.
 */
export function assembleChartProps(componentName, ctx, chartSpec = null) {
  const entry = COMPONENT_REGISTRY[componentName];
  if (!entry) return null;

  const props = {};
  const noop = () => {};

  for (const need of entry.dataNeeds) {
    switch (need) {
      case 'topics':
        props.topics = filterTopics(ctx.topics || [], chartSpec);
        break;
      case 'sentences':
        props.sentences = ctx.sentences || [];
        break;
      case 'submissionId':
        props.submissionId = ctx.submissionId;
        break;
      case 'mindmapData':
        props.mindmapData = {
          topic_mindmaps: ctx.topicMindmaps || {},
          sentences: ctx.sentences || [],
        };
        break;
      case 'dataExtractions':
        props.dataExtractions = ctx.dataExtractions || [];
        break;
      default:
        break;
    }
  }

  // Pass chartType for data-driven overview charts
  if (entry.chartType) {
    props.chartType = entry.chartType;
  }

  // Charts that support onShowInArticle get a noop in overview context
  if (['TreemapChart', 'ArticleStructureChart', 'TopicsRiverChart', 'TopicsBarChart',
       'CircularPackingChart', 'RadarChart', 'MarimekkoChartTab'].includes(componentName)) {
    props.onShowInArticle = noop;
  }

  return props;
}
