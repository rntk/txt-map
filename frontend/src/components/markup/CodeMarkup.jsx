import React from 'react';
import { getItemIndex, getTextByIndex } from './markupUtils';

export default function CodeMarkup({ segment, sentences }) {
  const { language, items = [] } = segment.data || {};
  // Strip sentence marker artifacts like "{42} " that the splitter embeds
  const stripMarker = (text) => (text || '').replace(/^\{\d+\}\s*/, '');

  const codeText = items
    .slice()
    .sort((a, b) => (getItemIndex(a) ?? 0) - (getItemIndex(b) ?? 0))
    .map(item => item.text
      ? stripMarker(item.text)
      : stripMarker(getTextByIndex(sentences, getItemIndex(item))))
    .join('\n');

  if (!codeText) return null;

  return (
    <div className="markup-segment markup-code">
      {language && <div className="markup-code__lang">{language}</div>}
      <pre className="markup-code__block"><code>{codeText}</code></pre>
    </div>
  );
}
