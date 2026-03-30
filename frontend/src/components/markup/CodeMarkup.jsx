import React, { useState, useCallback } from 'react';
import { getItemIndex, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

/**
 * CodeMarkup - Displays code snippets with syntax highlighting and copy functionality
 * Features language label, copy button, and accessibility attributes
 */
export default function CodeMarkup({ segment, sentences }) {
  const { language, items = [] } = segment.data || {};
  const [copied, setCopied] = useState(false);

  // Strip sentence marker artifacts like "{42} " that the splitter embeds
  const stripMarker = (text) => (text || '').replace(/^\{\d+\}\s*/, '');

  const codeText = items
    .slice()
    .sort((a, b) => (getItemIndex(a) ?? 0) - (getItemIndex(b) ?? 0))
    .map(item => item.text
      ? stripMarker(item.text)
      : stripMarker(getTextByIndex(sentences, getItemIndex(item))))
    .join('\n');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to copy code:', err);
    }
  }, [codeText]);

  if (!codeText) return null;

  return (
    <figure
      className="markup-segment markup-code"
      role="region"
      aria-label={language ? `Code snippet in ${language}` : 'Code snippet'}
    >
      <div className="markup-code__header">
        {language && (
          <span className="markup-code__lang">{language}</span>
        )}
        <button
          type="button"
          className="markup-code__copy-btn"
          onClick={handleCopy}
          aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
          aria-live="polite"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="markup-code__block">
        <code>
          <HighlightedText text={codeText} />
        </code>
      </pre>
    </figure>
  );
}
