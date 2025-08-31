import React, { useState, useEffect } from 'react';
import TopicList from './components/TopicList';
import TextDisplay from './components/TextDisplay';
import './styles/App.css';

function App() {
  const [data, setData] = useState(null);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [readTopics, setReadTopics] = useState(new Set());

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/themed-post')
      .then(response => response.json())
      .then(data => setData(data))
      .catch(error => console.error('Error fetching data:', error));
  }, []);

  const toggleTopic = (topic) => {
    setSelectedTopics(prev => 
      prev.includes(topic) 
        ? prev.filter(t => t !== topic) 
        : [...prev, topic]
    );
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

  if (!data) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app">
      <div className="container">
        <div className="left-column">
          <TopicList topics={data.topics} selectedTopics={selectedTopics} onToggleTopic={toggleTopic} onHoverTopic={setHoveredTopic} readTopics={readTopics} onToggleRead={toggleRead} />
        </div>
        <div className="right-column">
          <TextDisplay sentences={data.sentences} selectedTopics={selectedTopics} hoveredTopic={hoveredTopic} readTopics={readTopics} />
        </div>
      </div>
    </div>
  );
}

export default App;
