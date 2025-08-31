import React, { useState, useEffect } from 'react';
import TopicList from './components/TopicList';
import TextDisplay from './components/TextDisplay';
import './styles/App.css';

function App() {
  const [articles, setArticles] = useState([]);
  const [selectedTopicsList, setSelectedTopicsList] = useState([]);
  const [hoveredTopicList, setHoveredTopicList] = useState([]);
  const [readTopicsList, setReadTopicsList] = useState([]);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/themed-post')
      .then(response => response.json())
      .then(data => {
        setArticles(data);
        setSelectedTopicsList(data.map(() => []));
        setHoveredTopicList(data.map(() => null));
        setReadTopicsList(data.map(() => new Set()));
      })
      .catch(error => console.error('Error fetching data:', error));
  }, []);

  const toggleTopic = (articleIndex, topic) => {
    setSelectedTopicsList(prev => 
      prev.map((selected, idx) => 
        idx === articleIndex 
          ? (selected.includes(topic) 
              ? selected.filter(t => t !== topic) 
              : [...selected, topic])
          : selected
      )
    );
  };

  const setHoveredTopic = (articleIndex, topic) => {
    setHoveredTopicList(prev => 
      prev.map((hovered, idx) => 
        idx === articleIndex ? topic : hovered
      )
    );
  };

  const toggleRead = (articleIndex, topic) => {
    setReadTopicsList(prev => 
      prev.map((readSet, idx) => {
        if (idx === articleIndex) {
          const newSet = new Set(readSet);
          if (newSet.has(topic)) {
            newSet.delete(topic);
          } else {
            newSet.add(topic);
          }
          return newSet;
        }
        return readSet;
      })
    );
  };

  if (!articles.length) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app">
      {articles.map((article, index) => (
        <div key={index} className="article-section">
          <h1>Article {index + 1}</h1>
          <div className="container">
            <div className="left-column">
              <TopicList 
                topics={article.topics} 
                selectedTopics={selectedTopicsList[index] || []} 
                onToggleTopic={(topic) => toggleTopic(index, topic)} 
                onHoverTopic={(topic) => setHoveredTopic(index, topic)} 
                readTopics={readTopicsList[index] || new Set()} 
                onToggleRead={(topic) => toggleRead(index, topic)} 
              />
            </div>
            <div className="right-column">
              <TextDisplay 
                sentences={article.sentences} 
                selectedTopics={selectedTopicsList[index] || []} 
                hoveredTopic={hoveredTopicList[index]} 
                readTopics={readTopicsList[index] || new Set()} 
                articleIndex={index}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;
