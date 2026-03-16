import React from 'react';

function StatusIndicator({ tasks }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#4caf50';
      case 'processing': return '#2196f3';
      case 'failed': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✓';
      case 'processing': return '⟳';
      case 'failed': return '✗';
      default: return '○';
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      alignItems: 'center'
    }}>
      {Object.entries(tasks).map(([taskName, taskInfo]) => (
        <div key={taskName} style={{
          display: 'flex',
          alignItems: 'center',
          padding: '1px 6px',
          background: 'white',
          borderRadius: '4px',
          border: '1px solid #eee',
          fontSize: '12px',
          whiteSpace: 'nowrap'
        }} title={`${taskName.replace(/_/g, ' ')}: ${taskInfo.status}`}>
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
        </div>
      ))}
    </div>
  );
}

export default StatusIndicator;
