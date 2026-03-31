import React, { useMemo, useEffect } from 'react';
import RawTextDisplay from './shared/RawTextDisplay';

/**
 * @typedef {Object} RawTextViewProps
 * @property {string} rawText
 * @property {string} submissionId
 * @property {string|undefined} sourceUrl
 * @property {Array} highlightRanges
 * @property {Array} fadeRanges
 */
function RawTextView({ rawText, submissionId, sourceUrl, highlightRanges, fadeRanges }) {
  const downloadUrl = useMemo(() => {
    const blob = new Blob([rawText], { type: 'text/plain' });
    return URL.createObjectURL(blob);
  }, [rawText]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  return (
    <div className="summary-content">
      <div className="raw-text-meta" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>{rawText.length.toLocaleString()} characters</span>
        <button
          className="action-btn"
          style={{ padding: '2px 8px', fontSize: '11px' }}
          onClick={() => navigator.clipboard.writeText(rawText)}
        >
          Copy
        </button>
        <a
          className="action-btn"
          style={{ padding: '2px 8px', fontSize: '11px', textDecoration: 'none', verticalAlign: 'middle' }}
          href={downloadUrl}
          download={`${sourceUrl || submissionId}.txt`}
        >
          Download
        </a>
      </div>
      <RawTextDisplay
        rawText={rawText}
        articleIndex={0}
        highlightRanges={highlightRanges}
        fadeRanges={fadeRanges}
      />
    </div>
  );
}

export default RawTextView;
