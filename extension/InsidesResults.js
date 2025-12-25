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

  // Calculate stats
  // Check if items are objects or strings (backward compatibility)
  const isObjectFormat = insides.length > 0 && typeof insides[0] === 'object';

  const totalSentences = insides.length;
  const extractedSentences = isObjectFormat
    ? insides.filter(item => item.is_inside).length
    : totalSentences; // If old format strings, assume all are extracted

  const ratio = totalSentences > 0 ? Math.round((extractedSentences / totalSentences) * 100) : 0;

  // Group by paragraph
  const paragraphs = new Map();

  insides.forEach((item, index) => {
    const text = isObjectFormat ? item.text : item;
    const isInside = isObjectFormat ? item.is_inside : true;
    const paraIdx = isObjectFormat ? (item.paragraph_index !== undefined ? item.paragraph_index : 0) : index;

    if (!paragraphs.has(paraIdx)) {
      paragraphs.set(paraIdx, []);
    }
    paragraphs.get(paraIdx).push({ text, isInside, index });
  });

  // Sort paragraphs by index
  const sortedParagraphInfos = Array.from(paragraphs.entries())
    .sort((a, b) => a[0] - b[0]);

  return (
    <div className="insides-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ borderBottom: '2px solid #ffd700', paddingBottom: '10px', marginBottom: '20px' }}>
        <h1 style={{ margin: '0 0 10px 0' }}>💡 Insides & Insights</h1>
        <div style={{ display: 'flex', gap: '20px', fontSize: '0.9em', color: '#666' }}>
          <span>Total Sentences: <strong>{totalSentences}</strong></span>
          <span>Extracted: <strong>{extractedSentences}</strong></span>
          <span>Ratio: <strong>{ratio}%</strong></span>
        </div>
      </div>

      {totalSentences === 0 ? (
        <div className="no-results" style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <p>No text content found.</p>
        </div>
      ) : (
        <div className="insides-article" style={{ marginTop: '20px', lineHeight: '1.8' }}>
          {sortedParagraphInfos.map(([paraIdx, sentences]) => (
            <p key={paraIdx} style={{ marginBottom: '1.5em' }}>
              {sentences.map((sent, sIdx) => {
                const style = sent.isInside ? {
                  backgroundColor: '#fffbe6',
                  borderBottom: '2px solid #ffd700',
                  padding: '2px 0',
                  color: '#2c3e50',
                  fontWeight: '500'
                } : {
                  color: '#7f8c8d'
                };

                return (
                  <span key={sIdx} style={style}>
                    {sent.text}{' '}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      )}

      <div style={{ marginTop: '30px', fontSize: '0.9em', color: '#666', fontStyle: 'italic', borderTop: '1px solid #eee', paddingTop: '10px' }}>
        * Highlighted text indicates extracted key takeaways and insights. Grey text provides context.
      </div>
    </div>
  );
}

export default InsidesResults;
