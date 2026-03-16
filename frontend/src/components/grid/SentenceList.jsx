import React from 'react';

function SentenceList({ sentenceIndices, sentences }) {
  return (
    <div className="grid-view-sentences">
      {sentenceIndices.map((idx, i) => {
        const sentence = sentences[idx - 1];
        if (!sentence) return null;
        return (
          <div key={i} className="grid-view-sentence-item">
            <span className="grid-view-sentence-num">{idx}</span>
            <span>{sentence}</span>
          </div>
        );
      })}
    </div>
  );
}

export default SentenceList;
