import React from 'react';
import TopicList from './TopicList';
import OverlayPanel from './OverlayPanel';
import ArticleItem from './ArticleItem';

function ArticlesView({
  articles,
  allTopics,
  selectedTopics,
  hoveredTopic,
  readTopics,
  readArticles,
  showPanel,
  panelTopic,
  toggleTopic,
  handleHoverTopic,
  toggleRead,
  toggleShowPanel,
  toggleArticleRead,
  setSelectedTopics,
  setHoveredTopic,
  scrollToArticle,
  navigateTopicSentence
}) {
  return (
    <div className="app">
      <div className="container">
        <div className="left-column">
          <h1>Topics</h1>
          <TopicList
            topics={allTopics}
            selectedTopics={selectedTopics}
            onToggleTopic={toggleTopic}
            onHoverTopic={handleHoverTopic}
            readTopics={readTopics}
            onToggleRead={toggleRead}
            showPanel={showPanel}
            panelTopic={panelTopic}
            onToggleShowPanel={toggleShowPanel}
            onNavigateTopic={navigateTopicSentence}
          />
        </div>
        <div className="right-column">
          <OverlayPanel
            showPanel={showPanel}
            panelTopic={panelTopic}
            articles={articles}
            toggleShowPanel={toggleShowPanel}
            scrollToArticle={scrollToArticle}
          />
          {articles.map((article, index) => (
            <ArticleItem
              key={index}
              article={article}
              index={index}
              selectedTopics={selectedTopics}
              hoveredTopic={hoveredTopic}
              readTopics={readTopics}
              readArticles={readArticles}
              allTopics={allTopics}
              toggleArticleRead={toggleArticleRead}
              setSelectedTopics={setSelectedTopics}
              setHoveredTopic={setHoveredTopic}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ArticlesView;