import React from 'react';

function TopicsCloud({ topics }) {
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

export default TopicsCloud;