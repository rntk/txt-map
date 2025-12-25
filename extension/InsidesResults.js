import React from 'react';

function InsidesResults({ insidesData }) {
  if (!insidesData || !Array.isArray(insidesData.insides)) {
    return (
      <div className="insides-container">
        <h1>💡 Insides Analysis</h1>
        <p>No insights found or invalid data received.</p>
      </div>
    );
  }

  const { insides } = insidesData;

  return (
    <div className="insides-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ borderBottom: '2px solid #ffd700', paddingBottom: '10px' }}>💡 Insides & Insights</h1>
      
      {insides.length === 0 ? (
        <div className="no-results" style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <p>No specific "insides" or unusual insights were detected in the selected text.</p>
        </div>
      ) : (
        <div className="insides-list" style={{ marginTop: '20px' }}>
          {insides.map((inside, index) => (
            <div 
              key={index} 
              className="inside-item" 
              style={{ 
                marginBottom: '15px', 
                padding: '15px', 
                backgroundColor: '#fffbe6', 
                borderLeft: '4px solid #ffd700',
                borderRadius: '4px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                lineHeight: '1.6'
              }}
            >
              <span style={{ fontSize: '1.1em', fontWeight: '500' }}>{inside}</span>
            </div>
          ))}
        </div>
      )}
      
      <div style={{ marginTop: '30px', fontSize: '0.9em', color: '#666', fontStyle: 'italic' }}>
        * Insides include key takeaways, personal stories, and unusual or insightful information extracted from the text.
      </div>
    </div>
  );
}

export default InsidesResults;
