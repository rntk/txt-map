import React, { useState } from 'react';
import './sharedControls.css';
import './RefreshButton.css';

/**
 * @typedef {Object} RefreshButtonProps
 * @property {string} submissionId
 * @property {() => void} [onRefresh]
 * @property {boolean} [compact]
 */

/**
 * @param {RefreshButtonProps} props
 */
function RefreshButton({ submissionId, onRefresh, compact = false }) {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/submission/${submissionId}/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks: ['all'] })
        }
      );

      if (response.ok) {
        if (onRefresh) onRefresh();
      } else {
        console.error('Refresh failed:', await response.text());
      }
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setLoading(false);
    }
  };

  const sizeClass = compact ? 'refresh-button--compact' : 'refresh-button--normal';
  const iconClassName = loading ? 'refresh-button__icon refresh-button__icon--loading' : 'refresh-button__icon';

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={loading}
      className={`shared-control-button refresh-button ${sizeClass}`}
      title="Refresh all data for this submission"
    >
      {loading ? <span className={iconClassName}>...</span> : <><span className="refresh-button__icon">↻</span><span>Refresh</span></>}
    </button>
  );
}

export default RefreshButton;
