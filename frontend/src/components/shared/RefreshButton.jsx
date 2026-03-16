import React, { useState } from 'react';
import './RefreshButton.css';

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

  const sizeClass = compact ? 'refresh-btn--compact' : 'refresh-btn--normal';

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className={`action-btn refresh-btn ${sizeClass}`}
      title="Refresh all data for this submission"
    >
      {loading ? '...' : '\uD83D\uDD04 Refresh'}
    </button>
  );
}

export default RefreshButton;
