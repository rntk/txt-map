import React, { useState, useEffect } from 'react';
import TopicList from './components/TopicList';
import TextDisplay from './components/TextDisplay';
import TextPage from './components/TextPage';
import TaskControlPage from './components/TaskControlPage';
import TextListPage from './components/TextListPage';
import MainPage from './components/MainPage';
import './styles/App.css';

function App() {
  const [articles, setArticles] = useState([]);
  const [allTopics, setAllTopics] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [readTopics, setReadTopics] = useState(new Set());
  const [readArticles, setReadArticles] = useState(new Set());
  const [showPanel, setShowPanel] = useState(false);
  const [panelTopic, setPanelTopic] = useState(null);
  const [pageType, setPageType] = useState(null); // 'themed-post' | 'clustered-post' | 'topics'
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    const pathname = window.location.pathname;
    const pathParts = pathname.split('/');
    const apiType = pathParts[2]; // 'clustered-post', 'themed-post', 'topics', or 'text'
    const tag = pathParts.length > 3 && pathParts[3] ? pathParts[3] : null;
    setPageType(apiType);

    // If text submission page, text list page, or task control page, or no api type (main page), don't fetch articles
    if (!apiType || apiType === 'menu' || apiType === 'text' || apiType === 'tasks' || apiType === 'texts') {
      return;
    }

    // Determine limit from current URL ?limit=, default 10
    const searchParams = new URLSearchParams(window.location.search);
    let limitParam = parseInt(searchParams.get('limit'), 10);
    if (Number.isNaN(limitParam) || limitParam <= 0) {
      limitParam = 10;
    }

    // If topics page, fetch topics list and stop
    if (apiType === 'topics') {
      const url = `http://127.0.0.1:8000/api/topics?limit=${limitParam}`;
      fetch(url)
        .then(response => response.json())
        .then(data => {
          // data items: { name, totalPosts, totalSentences }
          setTopics(data || []);
        })
        .catch(error => console.error('Error fetching topics:', error));
      return;
    }

    let url;
    console.log(pathParts, apiType, 'limit=', limitParam);
    if (apiType === 'themed-post') {
      url = tag ? `http://127.0.0.1:8000/api/themed-post/${encodeURIComponent(tag)}?limit=${limitParam}` : `http://127.0.0.1:8000/api/themed-post?limit=${limitParam}`;
    } else if (apiType === 'themed-topic') {
      url = tag ? `http://127.0.0.1:8000/api/themed-topic/${encodeURIComponent(tag)}?limit=${limitParam}` : `http://127.0.0.1:8000/api/themed-topic?limit=${limitParam}`;
    } else {
      // Default to clustered
      url = tag ? `http://127.0.0.1:8000/api/clustered-post/${encodeURIComponent(tag)}?limit=${limitParam}` : `http://127.0.0.1:8000/api/clustered-post?limit=${limitParam}`;
    }

    fetch(url)
      .then(response => response.json())
      .then(data => {
        setArticles(data);
        // Collect all unique topics with sentence counts
        const topicMap = new Map();
        data.forEach((article) => {
          article.topics.forEach(topic => {
            const summary = (article.topic_summaries && article.topic_summaries[topic.name]) || topic.summary;
            if (!topicMap.has(topic.name)) {
              topicMap.set(topic.name, {
                ...topic,
                totalSentences: topic.sentences.length,
                summary: summary
              });
            } else {
              // Add to existing topic's sentence count
              const existing = topicMap.get(topic.name);
              existing.totalSentences += topic.sentences.length;
              if (!existing.summary && summary) {
                existing.summary = summary;
              }
            }
          });
        });
        setAllTopics(Array.from(topicMap.values()));
      })
      .catch(error => console.error('Error fetching data:', error));
  }, []);

  const toggleTopic = (topic) => {
    setSelectedTopics(prev => {
      const isCurrentlySelected = prev.some(t => t.name === topic.name);
      // Always clear hover state when deselecting a topic
      if (isCurrentlySelected) {
        setHoveredTopic(null);
      }
      return isCurrentlySelected
        ? prev.filter(t => t.name !== topic.name)
        : [...prev, topic];
    });
  };

  const handleHoverTopic = (topic) => {
    setHoveredTopic(topic);
  };

  const toggleRead = (topic) => {
    setReadTopics(prev => {
      const newSet = new Set(prev);
      if (newSet.has(topic)) {
        newSet.delete(topic);
      } else {
        newSet.add(topic);
      }
      return newSet;
    });
  };

  const toggleArticleRead = (articleIndex) => {
    const article = articles[articleIndex];
    const isCurrentlyRead = readArticles.has(articleIndex);

    setReadArticles(prev => {
      const newSet = new Set(prev);
      if (isCurrentlyRead) {
        newSet.delete(articleIndex);
      } else {
        newSet.add(articleIndex);
      }
      return newSet;
    });

    // Sync with topics - when article is marked as read, mark all its topics as read
    // When article is marked as unread, mark all its topics as unread
    setReadTopics(prev => {
      const newSet = new Set(prev);
      article.topics.forEach(topic => {
        if (isCurrentlyRead) {
          // Article was read, now marking as unread - remove topic from read topics
          newSet.delete(topic);
        } else {
          // Article was unread, now marking as read - add topic to read topics
          newSet.add(topic);
        }
      });
      return newSet;
    });
  };

  const toggleShowPanel = (topicOrTopics) => {
    // Handle both single topic and array of topics
    const isSameTopic = Array.isArray(topicOrTopics)
      ? Array.isArray(panelTopic) && JSON.stringify(topicOrTopics) === JSON.stringify(panelTopic)
      : panelTopic === topicOrTopics;

    if (showPanel && isSameTopic) {
      setShowPanel(false);
      setPanelTopic(null);
    } else {
      setShowPanel(true);
      setPanelTopic(topicOrTopics);
    }
  };

  const scrollToArticle = (articleIndex) => {
    const articleElement = document.getElementById(`article-${articleIndex}`);
    if (articleElement) {
      articleElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const navigateTopicSentence = (topic, direction = 'next') => {
    if (!topic || !topic.name) return;
    // Build list of targets across all articles
    const targets = [];
    articles.forEach((article, aIdx) => {
      const related = article.topics.find(t => t.name === topic.name);
      if (related && Array.isArray(related.sentences)) {
        related.sentences.forEach(num => {
          const sIdx0 = (num || 1) - 1; // convert to 0-based index
          targets.push({ aIdx, sIdx0, id: `sentence-${aIdx}-${sIdx0}` });
        });
      }
    });
    if (targets.length === 0) return;
    targets.sort((x, y) => x.aIdx - y.aIdx || x.sIdx0 - y.sIdx0);

    // Determine current position relative to targets
    const viewportTop = window.scrollY || document.documentElement.scrollTop || 0;
    const viewportBottom = viewportTop + (window.innerHeight || document.documentElement.clientHeight || 0);

    // Find index of the target to go to
    let targetIndex = -1;
    if (direction === 'next') {
      // choose first target whose element top is below current scrollTop + small epsilon
      for (let i = 0; i < targets.length; i++) {
        const el = document.getElementById(targets[i].id);
        if (el) {
          const rect = el.getBoundingClientRect();
          const absTop = rect.top + window.scrollY;
          if (absTop > viewportTop + 4) { // a bit below current top
            targetIndex = i;
            break;
          }
        }
      }
      if (targetIndex === -1) targetIndex = 0; // wrap
    } else {
      // prev: choose last target whose bottom is above current scrollTop - epsilon
      for (let i = targets.length - 1; i >= 0; i--) {
        const el = document.getElementById(targets[i].id);
        if (el) {
          const rect = el.getBoundingClientRect();
          const absBottom = rect.bottom + window.scrollY;
          if (absBottom < viewportBottom - (window.innerHeight || 0) + 4) {
            // effectively above the top
            if (absBottom < viewportTop - 4) {
              targetIndex = i;
              break;
            }
          } else if (rect.top + window.scrollY < viewportTop - 4) {
            targetIndex = i;
            break;
          }
        }
      }
      if (targetIndex === -1) targetIndex = targets.length - 1; // wrap
    }

    const target = targets[targetIndex];
    if (!target) return;
    const targetEl = document.getElementById(target.id);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Ensure element is visible; avoid imperatively changing classes to not conflict with React-controlled highlighting
    } else {
      // If target element not in DOM yet, scroll to its article first
      scrollToArticle(target.aIdx);
      setTimeout(() => {
        const el2 = document.getElementById(target.id);
        if (el2) el2.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  // Loading state handling
  if (!pageType || pageType === 'menu') {
    return <MainPage />;
  }

  if (pageType === 'tasks') {
    return <TaskControlPage />;
  }
  if (pageType === 'texts') {
    return <TextListPage />;
  }
  if (pageType === 'topics') {
    if (!topics.length) {
      return <div>Loading...</div>;
    }
    // Word cloud rendering
    const totals = topics.map(t => t.totalPosts || 0);
    const min = Math.min(...totals, 0);
    const max = Math.max(...totals, 1);
    const scale = (val) => {
      // font size between 12 and 40 px
      const minSize = 12;
      const maxSize = 40;
      const ratio = max === min ? 0.5 : (val - min) / (max - min);
      return Math.round(minSize + ratio * (maxSize - minSize));
    };
    return (
      <div className="app">
        <div className="container">
          <div className="right-column" style={{ width: '100%' }}>
            <h1>Topics Cloud</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {topics.map((t) => {
                const fontSize = scale(t.totalPosts || t.totalSentences || 0);
                const href = `/page/themed-topic/${encodeURIComponent(t.name)}`;
                return (
                  <a
                    key={t.name}
                    href={href}
                    title={`${t.name} • Posts: ${t.totalPosts ?? 0} • Sentences: ${t.totalSentences ?? 0}`}
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: 1.1,
                      textDecoration: 'none',
                      color: '#3366cc',
                    }}
                  >
                    {t.name}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render TextPage for submission pages
  if (pageType === 'text') {
    return <TextPage />;
  }

  if (!articles.length) {
    return <div>Loading...</div>;
  }

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
          {showPanel && panelTopic && (() => {
            // Handle both single topic and array of topics
            const topics = Array.isArray(panelTopic) ? panelTopic : [panelTopic];
            const topicNames = topics.map(t => t.name);
            const totalSentences = topics.reduce((sum, t) => sum + t.totalSentences, 0);
            const displayName = Array.isArray(panelTopic)
              ? `${topics[0].name.split(/[\s_]/)[0]} (${topics.length} topics)`
              : panelTopic.name;

            return (
              <div className="overlay-panel">
                <div className="overlay-header">
                  <div className="overlay-title-section">
                    <h2>Sentences for {displayName}: {totalSentences} sentences</h2>
                    {!Array.isArray(panelTopic) && panelTopic.summary && (
                      <div className="overlay-summary-note">
                        <span className="summary-icon">📝</span> {panelTopic.summary}
                      </div>
                    )}
                  </div>
                  <button onClick={() => toggleShowPanel(panelTopic)} className="close-panel">×</button>
                </div>
                <div className="overlay-content">
                  {articles.map((article, index) => {
                    // Find all related topics in this article
                    const relatedTopics = article.topics.filter(t => topicNames.includes(t.name));
                    if (relatedTopics.length === 0) return null;

                    // Collect all sentence indices from all related topics
                    const allSentenceIndices = new Set();
                    relatedTopics.forEach(topic => {
                      topic.sentences.forEach(idx => allSentenceIndices.add(idx));
                    });

                    // Sort sentence indices to maintain original order
                    const sortedIndices = Array.from(allSentenceIndices).sort((a, b) => a - b);

                    return (
                      <div key={index} className="article-section">
                        <h3
                          className="article-link"
                          onClick={() => scrollToArticle(index)}
                        >
                          Article {index + 1} ({relatedTopics.map(t => t.name).join(', ')})
                        </h3>
                        <div className="article-text">
                          {sortedIndices.map((sentenceIndex, idx) => {
                            const sentence = article.sentences[sentenceIndex - 1];
                            const isGap = idx > 0 && sortedIndices[idx] !== sortedIndices[idx - 1] + 1;

                            return (
                              <React.Fragment key={sentenceIndex}>
                                {isGap && <div className="sentence-gap">...</div>}
                                <span className="sentence-block">{sentence} </span>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {articles.map((article, index) => (
            <div key={index} id={`article-${index}`} className="article-section">
              <div className="article-header">
                <div className="article-title-section">
                  <h1>Article {index + 1} ({article.topics.length} topics)</h1>
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
              <TextDisplay
                sentences={article.sentences}
                selectedTopics={selectedTopics}
                hoveredTopic={hoveredTopic}
                readTopics={readTopics}
                articleTopics={article.topics}
                articleIndex={index}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
