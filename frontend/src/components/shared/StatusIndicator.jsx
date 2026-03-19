import React, { useState } from 'react';

function getStatusColor(status) {
  switch (status) {
    case 'completed': return '#4caf50';
    case 'processing': return '#2196f3';
    case 'failed': return '#f44336';
    default: return '#9e9e9e';
  }
}

function getStatusIcon(status) {
  switch (status) {
    case 'completed': return '✓';
    case 'processing': return '⟳';
    case 'failed': return '✗';
    default: return '○';
  }
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const ms = end - start;
  if (ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function TaskDetail({ taskName, taskInfo, onClose }) {
  const duration = formatDuration(taskInfo.started_at, taskInfo.completed_at);
  return (
    <div style={{
      position: 'absolute',
      zIndex: 200,
      top: '100%',
      left: 0,
      marginTop: '4px',
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '6px',
      boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
      padding: '10px 12px',
      minWidth: '200px',
      fontSize: '12px',
      color: '#333',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '6px', textTransform: 'capitalize' }}>
        {taskName.replace(/_/g, ' ')}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ color: getStatusColor(taskInfo.status), fontWeight: 'bold' }}>
          {getStatusIcon(taskInfo.status)}
        </span>
        <span style={{ textTransform: 'capitalize' }}>{taskInfo.status}</span>
      </div>
      {duration && (
        <div style={{ color: '#666', marginBottom: '4px' }}>
          Duration: {duration}
        </div>
      )}
      {taskInfo.error && (
        <div style={{
          color: '#c62828',
          background: '#ffebee',
          border: '1px solid #ffcdd2',
          borderRadius: '4px',
          padding: '4px 6px',
          marginTop: '4px',
          wordBreak: 'break-word',
          maxWidth: '280px',
        }}>
          {taskInfo.error}
        </div>
      )}
      <button
        onClick={onClose}
        style={{
          marginTop: '8px',
          fontSize: '11px',
          padding: '2px 8px',
          border: '1px solid #ddd',
          borderRadius: '3px',
          background: '#f5f5f5',
          cursor: 'pointer',
          color: '#555',
        }}
      >
        Close
      </button>
    </div>
  );
}

function StatusIndicator({ tasks }) {
  const [openTask, setOpenTask] = useState(null);

  const handleToggle = (taskName) => {
    setOpenTask(prev => prev === taskName ? null : taskName);
  };

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      alignItems: 'center'
    }}>
      {Object.entries(tasks).map(([taskName, taskInfo]) => (
        <div key={taskName} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => handleToggle(taskName)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '1px 6px',
              background: openTask === taskName ? '#f0f4ff' : 'white',
              borderRadius: '4px',
              border: `1px solid ${openTask === taskName ? '#a0b8e8' : '#eee'}`,
              fontSize: '12px',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            <span style={{
              marginRight: '4px',
              fontWeight: 'bold',
              color: getStatusColor(taskInfo.status)
            }}>
              {getStatusIcon(taskInfo.status)}
            </span>
            <span style={{ color: '#444', textTransform: 'capitalize' }}>
              {taskName.replace(/_/g, ' ')}
            </span>
            <span style={{ color: '#888', fontSize: '10px', marginLeft: '3px', textTransform: 'capitalize' }}>
              {taskInfo.status}
            </span>
          </button>
          {openTask === taskName && (
            <TaskDetail
              taskName={taskName}
              taskInfo={taskInfo}
              onClose={() => setOpenTask(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default React.memo(StatusIndicator);
