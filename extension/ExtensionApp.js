import React, { useState, useEffect, useCallback, useRef } from 'react';
import TopicList from '../frontend/src/components/TopicList';
import TextDisplay from '../frontend/src/components/TextDisplay';
import '../frontend/src/styles/App.css';

function ExtensionApp() {
  const [articles, setArticles] = useState([]);
  const [allTopics, setAllTopics] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [readTopics, setReadTopics] = useState(new Set());
  const [readArticles, setReadArticles] = useState(new Set());
  const [showPanel, setShowPanel] = useState(false);
  const [panelTopic, setPanelTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Use refs to track if component is mounted
  const isMountedRef = useRef(true);

  // Define handler with useCallback
  const handleMessage = useCallback((event) => {
    if (!isMountedRef.current) return;
    
    console.log('Message received:', event.data?.type);
    
    if (event.data?.type === 'RSSTAG_DATA') {
      try {
        console.log('Processing RSSTAG_DATA:', event.data.data);
        const apiData = event.data.data;
        
        if (!isMountedRef.current) return;
        
        // Ensure data has required fields
        if (!apiData || !Array.isArray(apiData.sentences)) {
          console.error('Invalid data structure - missing sentences:', apiData);
          setLoading(false);
          return;
        }
        
        if (!Array.isArray(apiData.topics)) {
          console.error('Invalid data structure - missing topics:', apiData);
          setLoading(false);
          return;
        }
        
        const data = [apiData]; // Wrap single article in array
        
        // Collect all unique topics with sentence counts
        const topicMap = new Map();
        data.forEach((article, index) => {
          if (article.topics && Array.isArray(article.topics)) {
            article.topics.forEach(topic => {
              if (topic && topic.name && Array.isArray(topic.sentences)) {
                if (!topicMap.has(topic.name)) {
                  topicMap.set(topic.name, { ...topic, totalSentences: topic.sentences.length });
                } else {
                  // Add to existing topic's sentence count
                  const existing = topicMap.get(topic.name);
                  existing.totalSentences += topic.sentences.length;
                }
              }
            });
          }
        });
        
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setArticles(data);
          setAllTopics(Array.from(topicMap.values()));
          console.log('Data processing complete, state updated');
          setLoading(false);
        }
      } catch (error) {
        console.error('Error processing data:', error, error.stack);
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }
  }, []);

  useEffect(() => {
    console.log('ExtensionApp mounted');
    isMountedRef.current = true;
    
    // Add listener
    window.addEventListener('message', handleMessage);
    console.log('Message listener attached');
    
    return () => {
      console.log('ExtensionApp cleanup - removing listener');
      isMountedRef.current = false;
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  const toggleTopic = (topic) => {
    setSelectedTopics(prev => 
      prev.includes(topic) 
        ? prev.filter(t => t !== topic) 
        : [...prev, topic]
    );
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

  const toggleShowPanel = (topic) => {
    if (showPanel && panelTopic === topic) {
      setShowPanel(false);
      setPanelTopic(null);
    } else {
      setShowPanel(true);
      setPanelTopic(topic);
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

  if (loading) {
    return <div className="page-message">Loading and analyzing page content...</div>;
  }

  if (!articles.length) {
    return <div className="page-message">No content to analyze.</div>;
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
          />
        </div>
        <div className="right-column">
          {showPanel && panelTopic && (
            <div className="overlay-panel">
              <div className="overlay-header">
                <h2>Sentences for topic: {panelTopic.name} ({panelTopic.totalSentences} sentences)</h2>
                <button onClick={() => toggleShowPanel(panelTopic)} className="close-panel">×</button>
              </div>
              <div className="overlay-content">
                {articles.map((article, index) => {
                  const relatedTopic = article.topics.find(t => t.name === panelTopic.name);
                  if (!relatedTopic) return null;

                  // Sort sentence indices to maintain original order
                  const sortedIndices = [...relatedTopic.sentences].sort((a, b) => a - b);

                  return (
                    <div key={index} className="article-section">
                      <h3 
                        className="article-link" 
                        onClick={() => scrollToArticle(index)}
                      >
                        Article {index + 1}
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
          )}
          {articles.map((article, index) => (
            <div key={index} id={`article-${index}`} className="article-section">
              <div className="article-header">
                <div className="article-title-section">
                  <h1>Analyzed Page ({article.topics.length} topics)</h1>
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
                      if (articleTopics.some(topic => selectedTopics.includes(topic))) {
                        // If any topics are already selected, deselect them
                        setSelectedTopics(prev => 
                          prev.filter(topic => !articleTopics.some(t => t.name === topic.name))
                        );
                      } else {
                        // Otherwise, select all topics for this article
                        setSelectedTopics(prev => {
                          const newTopics = [...prev];
                          articleTopics.forEach(topic => {
                            if (!newTopics.some(t => t.name === topic.name)) {
                              newTopics.push(topic);
                            }
                          });
                          return newTopics;
                        });
                      }
                    }}
                    checked={article.topics.some(topic => selectedTopics.includes(topic))}
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

export default ExtensionApp;
