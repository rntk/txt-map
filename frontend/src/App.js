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

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/themed-post')
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
          />
        </div>
        <div className="right-column">
          {articles.map((article, index) => (
            <div key={index} className="article-section">
              <h1>Article {index + 1}</h1>
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
