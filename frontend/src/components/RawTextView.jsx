import React, { useMemo, useEffect } from 'react';
import RawTextDisplay from './shared/RawTextDisplay';
import '../styles/text-reading.css';

/**
 * @typedef {Object} RawTextViewProps
 * @property {string} rawText
 * @property {string} submissionId
 * @property {string|undefined} sourceUrl
 * @property {Array} highlightRanges
 * @property {Array} fadeRanges
 * @property {Array<{start: number, end: number, color: string}>} [coloredRanges]
 */
function RawTextView({ rawText, submissionId, sourceUrl, highlightRanges, fadeRanges, coloredRanges = [] }) {
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
    <div className="summary-content reading-raw-text">
      <div className="raw-text-meta reading-raw-text__meta">
        <span>{rawText.length.toLocaleString()} characters</span>
        <div className="reading-raw-text__actions">
          <button
            type="button"
            className="action-btn action-btn-toolbar reading-raw-text__action"
            onClick={() => navigator.clipboard.writeText(rawText)}
          >
            Copy
          </button>
          <a
            className="action-btn action-btn-toolbar reading-raw-text__action reading-raw-text__download"
            href={downloadUrl}
            download={`${sourceUrl || submissionId}.txt`}
          >
            Download
          </a>
        </div>
      </div>
      <RawTextDisplay
        rawText={rawText}
        articleIndex={0}
        highlightRanges={highlightRanges}
        fadeRanges={fadeRanges}
        coloredRanges={coloredRanges}
      />
    </div>
  );
}

export default RawTextView;
