import TreemapChart from '../TreemapChart';
import ArticleStructureChart from '../ArticleStructureChart';
import TopicsRiverChart from '../TopicsRiverChart';
import TopicsBarChart from '../TopicsBarChart';
import TopicsTagCloud from '../TopicsTagCloud';
import CircularPackingChart from '../CircularPackingChart';
import RadarChart from '../RadarChart';
import MarimekkoChartTab from '../MarimekkoChartTab';
import MindmapResults from '../MindmapResults';

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
};

/**
 * Assemble props for a chart component from submission data context.
 */
export function assembleChartProps(componentName, ctx) {
  const entry = COMPONENT_REGISTRY[componentName];
  if (!entry) return null;

  const props = {};
  const noop = () => {};

  for (const need of entry.dataNeeds) {
    switch (need) {
      case 'topics':
        props.topics = ctx.topics || [];
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
      default:
        break;
    }
  }

  // Charts that support onShowInArticle get a noop in overview context
  if (['TreemapChart', 'ArticleStructureChart', 'TopicsRiverChart', 'TopicsBarChart',
       'CircularPackingChart', 'RadarChart', 'MarimekkoChartTab'].includes(componentName)) {
    props.onShowInArticle = noop;
  }

  return props;
}
