import React, { useState, useEffect } from 'react';
import TopicList from './components/TopicList';
import TextDisplay from './components/TextDisplay';
import './styles/App.css';

function App() {
  const [data, setData] = useState(null);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);

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

  if (!data) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app">
      <div className="container">
        <div className="left-column">
          <TopicList topics={data.topics} selectedTopics={selectedTopics} onToggleTopic={toggleTopic} onHoverTopic={setHoveredTopic} />
        </div>
        <div className="right-column">
          <TextDisplay sentences={data.sentences} selectedTopics={selectedTopics} hoveredTopic={hoveredTopic} />
        </div>
      </div>
    </div>
  );
}

export default App;
