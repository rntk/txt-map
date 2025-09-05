import React, { useState, useEffect } from 'react';
import TopicList from './components/TopicList';
import TextDisplay from './components/TextDisplay';
import './styles/App.css';

function App() {
  const [articles, setArticles] = useState([]);
  const [allTopics, setAllTopics] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [readTopics, setReadTopics] = useState(new Set());
  const [showPanel, setShowPanel] = useState(false);
  const [panelTopic, setPanelTopic] = useState(null);

  useEffect(() => {
    const pathname = window.location.pathname;
    const pathParts = pathname.split('/');
    const tag = pathParts.length > 3 ? pathParts[3] : null;
    const url = tag ? `http://127.0.0.1:8000/api/themed-post/${tag}?limit=10` : 'http://127.0.0.1:8000/api/themed-post?limit=10';
    fetch(url)
      .then(response => response.json())
      .then(data => {
        setArticles(data);
        // Collect all unique topics
        const topicMap = new Map();
        data.forEach((article, index) => {
          article.topics.forEach(topic => {
            if (!topicMap.has(topic.name)) {
              topicMap.set(topic.name, topic);
            }
          });
        });
        setAllTopics(Array.from(topicMap.values()));
      })
      .catch(error => console.error('Error fetching data:', error));
  }, []);

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
          />
        </div>
        <div className="right-column">
          {showPanel && panelTopic && (
            <div className="overlay-panel">
              <div className="overlay-header">
                <h2>Sentences for topic: {panelTopic.name}</h2>
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
                <h1>Article {index + 1}</h1>
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

export default App;
