import React from 'react';

export default function DialogMarkup({ segment, sentences }) {
  const speakers = segment.data?.speakers || [];
  if (speakers.length === 0) return null;

  // Build a flat ordered list of lines sorted by sentence_index
  const allLines = [];
  speakers.forEach((speaker, speakerIdx) => {
    (speaker.lines || []).forEach(line => {
      allLines.push({ speakerIdx, name: speaker.name, ...line });
    });
  });
  allLines.sort((a, b) => a.sentence_index - b.sentence_index);

  return (
    <div className="markup-segment markup-dialog">
      {allLines.map((line, i) => {
        const side = line.speakerIdx % 2 === 0 ? 'even' : 'odd';
        return (
          <div key={i} className={`markup-dialog__line markup-dialog__line--${side}`}>
            <span className="markup-dialog__speaker">{line.name}</span>
            <div className={`markup-dialog__bubble markup-dialog__bubble--${side}`}>
              {line.text || (sentences && sentences[line.sentence_index - 1]) || ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}
