import React, { useState, useEffect } from 'react';
import TopicList from './components/TopicList';
import TextDisplay from './components/TextDisplay';
import './styles/App.css';

function App() {
  const [data, setData] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/themed-post')
      .then(response => response.json())
      .then(data => setData(data))
      .catch(error => console.error('Error fetching data:', error));
  }, []);

  if (!data) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app">
      <div className="container">
        <div className="left-column">
          <TopicList topics={data.topics} onTopicSelect={setSelectedTopic} />
        </div>
        <div className="right-column">
          <TextDisplay sentences={data.sentences} selectedTopic={selectedTopic} />
        </div>
      </div>
    </div>
  );
}

export default App;
