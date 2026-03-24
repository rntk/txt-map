import React from 'react';

export default function CodeMarkup({ segment, sentences }) {
  const { language, items = [] } = segment.data || {};
  // Strip sentence marker artifacts like "{42} " that the splitter embeds
  const stripMarker = (text) => (text || '').replace(/^\{\d+\}\s*/, '');

  const codeText = items
    .slice()
    .sort((a, b) => a.sentence_index - b.sentence_index)
    .map(item => item.text
      ? stripMarker(item.text)
      : stripMarker(sentences && sentences[item.sentence_index - 1] || ''))
    .join('\n');

  if (!codeText) return null;

  return (
    <div className="markup-segment markup-code">
      {language && <div className="markup-code__lang">{language}</div>}
      <pre className="markup-code__block"><code>{codeText}</code></pre>
    </div>
  );
}
