import React from 'react';
import { buildRawTextSegments } from '../../utils/textHighlight';

function RawTextDisplay({ rawText, articleIndex, highlightRanges, fadeRanges }) {
  if (!rawText) {
    return (
      <pre className="raw-text-content raw-text-content-page">No raw text available.</pre>
    );
  }

  const segments = buildRawTextSegments(rawText, highlightRanges, fadeRanges);

  return (
    <pre className="raw-text-content raw-text-content-page">
      {segments.map((segment) => (
        segment.state ? (
          <span
            key={`${segment.start}-${segment.end}-${segment.state}`}
            className={`raw-text-token ${segment.state}`}
            data-article-index={articleIndex}
            data-char-start={segment.start}
            data-char-end={segment.end}
          >
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={`${segment.start}-${segment.end}-plain`}>
            {segment.text}
          </React.Fragment>
        )
      ))}
    </pre>
  );
}

export default RawTextDisplay;
