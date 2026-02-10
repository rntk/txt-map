import React, { useState } from 'react';
import TextDisplay from './TextDisplay';
import { sanitizeHTML } from '../utils/sanitize';

function ArticleItem({
  article,
  index,
  selectedTopics,
  hoveredTopic,
  readTopics,
  readArticles,
  allTopics,
  toggleArticleRead,
  setSelectedTopics,
  setHoveredTopic
}) {
  const [articleTabs, setArticleTabs] = useState({});

  const getArticleTab = (index) => articleTabs[index] || 'article';

  const setArticleTab = (index, tab) => {
    setArticleTabs(prev => ({
      ...prev,
      [index]: tab
    }));
  };

  const renderTabContent = (content, emptyMessage) => {
    if (!content || (Array.isArray(content) && content.length === 0)) {
      return <p>{emptyMessage}</p>;
    }

    if (Array.isArray(content)) {
      return content.map((item, idx) => (
        <p key={idx} dangerouslySetInnerHTML={{ __html: sanitizeHTML(String(item)) }} />
      ));
    }

    return <div dangerouslySetInnerHTML={{ __html: sanitizeHTML(String(content)) }} />;
  };

  return (
    <div key={index} id={`article-${index}`} className="article-section">
      <div className="article-header">
        <div className="article-title-section">
          <h1>Article {index + 1} ({article.topics.length} topics)</h1>
        </div>
        <div className="article-controls">
          <div className="tabs">
            <button
              className={getArticleTab(index) === 'article' ? 'active' : ''}
              onClick={() => setArticleTab(index, 'article')}
            >
              Article
            </button>
            <button
              className={getArticleTab(index) === 'summary' ? 'active' : ''}
              onClick={() => setArticleTab(index, 'summary')}
            >
              Summary
            </button>
            <button
              className={getArticleTab(index) === 'raw_text' ? 'active' : ''}
              onClick={() => setArticleTab(index, 'raw_text')}
            >
              Raw Text
            </button>
          </div>
          <label className="article-read-checkbox">
            <input
              type="checkbox"
              checked={readArticles.has(index)}
              onChange={() => toggleArticleRead(index)}
            />
            Mark as read
          </label>
          <label className="highlight-topics-checkbox">
            <input
              type="checkbox"
              onChange={() => {
                // Toggle all topics associated with this article
                const articleTopics = article.topics;
                const isAnySelected = articleTopics.some(topic => selectedTopics.some(t => t.name === topic.name));
                if (isAnySelected) {
                  // Deselect all related to this article (by name) and clear hover
                  setHoveredTopic(null);
                  setSelectedTopics(prev => prev.filter(topic => !articleTopics.some(t => t.name === topic.name)));
                } else {
                  // Select all topics for this article using canonical topic objects from allTopics
                  setSelectedTopics(prev => {
                    const newTopics = [...prev];
                    articleTopics.forEach(topic => {
                      const canonical = allTopics.find(t => t.name === topic.name) || topic;
                      if (!newTopics.some(t => t.name === canonical.name)) {
                        newTopics.push(canonical);
                      }
                    });
                    return newTopics;
                  });
                }
              }}
              checked={article.topics.some(topic => selectedTopics.some(t => t.name === topic.name))}
            />
            Highlight topics
          </label>
        </div>
      </div>
      {getArticleTab(index) === 'summary' ? (
        <div className="summary-content">
          <h2>Summary</h2>
          <div className="summary-text">
            {renderTabContent(article.summary, 'No summary available.')}
          </div>
        </div>
      ) : getArticleTab(index) === 'raw_text' ? (
        <div className="summary-content">
          <h2>Raw Text</h2>
          {(article.raw_html || article.raw_text) ? (
            <TextDisplay
              sentences={article.sentences}
              selectedTopics={selectedTopics}
              hoveredTopic={hoveredTopic}
              readTopics={readTopics}
              articleTopics={article.topics}
              articleIndex={index}
              rawHtml={article.raw_html || article.raw_text}
            />
          ) : (
            <div className="summary-text">
              <p>No raw text available.</p>
            </div>
          )}
        </div>
      ) : (
        <TextDisplay
          sentences={article.sentences}
          selectedTopics={selectedTopics}
          hoveredTopic={hoveredTopic}
          readTopics={readTopics}
          articleTopics={article.topics}
          articleIndex={index}
        />
      )}
    </div>
  );
}

export default ArticleItem;
