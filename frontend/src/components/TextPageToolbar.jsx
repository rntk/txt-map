import React, { useState, useCallback } from 'react';
import DropdownMenu from './shared/DropdownMenu';
import StatusIndicator from './shared/StatusIndicator';
import RefreshButton from './shared/RefreshButton';

/**
 * @typedef {Object} TextPageToolbarProps
 * @property {string} submissionId
 * @property {{ overall: string, tasks: Object }} status
 * @property {() => void} onRefresh
 */
function TextPageToolbar({ submissionId, status, onRefresh }) {
  const [actionMessage, setActionMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const runRefresh = useCallback(async (tasks, successMessage) => {
    setActionMessage('');
    setActionLoading(true);
    try {
      const response = await fetch(
        `/api/submission/${submissionId}/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks })
        }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setActionMessage(successMessage);
      onRefresh();
    } catch (err) {
      setActionMessage(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }, [submissionId, onRefresh]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this submission and all its queued tasks? This cannot be undone.')) {
      return;
    }
    setActionMessage('');
    setActionLoading(true);
    try {
      const response = await fetch(
        `/api/submission/${submissionId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setActionMessage('Submission deleted.');
      window.location.href = '/page/topics';
    } catch (err) {
      setActionMessage(`Delete failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }, [submissionId]);

  return (
    <>
      <DropdownMenu buttonContent={<span>Status</span>}>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }}>Task Status</div>
        <StatusIndicator tasks={status.tasks} />
      </DropdownMenu>

      <DropdownMenu buttonContent={<><span style={{ fontSize: '14px', lineHeight: 1 }}>☰</span> Menu</>}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#666' }}>Recalculate</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['all'], 'Recalculation queued for all tasks.')} disabled={actionLoading}>All</button>
          <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['split_topic_generation', 'subtopics_generation', 'summarization', 'mindmap', 'insights_generation'], 'Topic-related tasks queued.')} disabled={actionLoading}>Topics</button>
          <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['summarization'], 'Summarization queued.')} disabled={actionLoading}>Summary</button>
          <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['mindmap'], 'Mindmap queued.')} disabled={actionLoading}>Mindmap</button>
          <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['prefix_tree'], 'Prefix tree queued.')} disabled={actionLoading}>Prefix Tree</button>
          <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['insights_generation'], 'Insights queued.')} disabled={actionLoading}>Insights</button>
          <button className="action-btn" style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left' }} onClick={() => runRefresh(['markup_generation'], 'Markup generation queued.')} disabled={actionLoading}>Markup</button>
        </div>

        <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #eee' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <RefreshButton submissionId={submissionId} onRefresh={onRefresh} compact={false} />
          <button
            className="action-btn danger"
            onClick={handleDelete}
            disabled={actionLoading}
            style={{ padding: '6px 10px', fontSize: '12px', textAlign: 'center' }}
          >
            Delete
          </button>
        </div>
        {actionMessage && <div style={{ marginTop: '4px', fontSize: '11px', color: '#666', background: '#f5f5f5', padding: '4px', borderRadius: '4px' }}>{actionMessage}</div>}
      </DropdownMenu>
    </>
  );
}

export default TextPageToolbar;
