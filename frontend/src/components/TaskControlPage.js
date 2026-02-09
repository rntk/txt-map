import React, { useEffect, useState } from 'react';
import '../styles/App.css';

const TASK_TYPES = [
  'split_topic_generation',
  'subtopics_generation',
  'summarization',
  'mindmap',
  'insides'
];

function TaskControlPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    submissionId: '',
    status: '',
    limit: '100'
  });
  const [newTask, setNewTask] = useState({
    submissionId: '',
    taskType: 'split_topic_generation',
    priority: ''
  });
  const [actionMessage, setActionMessage] = useState('');

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (filters.submissionId) params.append('submission_id', filters.submissionId);
    if (filters.status) params.append('status', filters.status);
    const limit = Number.parseInt(filters.limit, 10);
    if (Number.isFinite(limit) && limit > 0) params.append('limit', String(limit));
    return params.toString();
  };

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery();
      const response = await fetch(`http://127.0.0.1:8000/api/task-queue?${query}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleDelete = async (taskId) => {
    setActionMessage('');
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/task-queue/${taskId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setActionMessage('Task deleted.');
      fetchTasks();
    } catch (err) {
      setActionMessage(`Delete failed: ${err.message}`);
    }
  };

  const handleRepeat = async (taskId) => {
    setActionMessage('');
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/task-queue/${taskId}/repeat`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setActionMessage('Task re-queued.');
      fetchTasks();
    } catch (err) {
      setActionMessage(`Repeat failed: ${err.message}`);
    }
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    setActionMessage('');

    if (!newTask.submissionId || !newTask.taskType) {
      setActionMessage('Submission ID and task type are required.');
      return;
    }

    const payload = {
      submission_id: newTask.submissionId,
      task_type: newTask.taskType
    };

    if (newTask.priority) {
      payload.priority = Number(newTask.priority);
    }

    try {
      const response = await fetch('http://127.0.0.1:8000/api/task-queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setActionMessage('Task added to queue.');
      setNewTask(prev => ({ ...prev, priority: '' }));
      fetchTasks();
    } catch (err) {
      setActionMessage(`Add failed: ${err.message}`);
    }
  };

  const handleFilterSubmit = (event) => {
    event.preventDefault();
    fetchTasks();
  };

  return (
    <div className="app task-page">
      <div className="task-page-header">
        <div>
          <h1>Task Control</h1>
          <p className="task-page-subtitle">Manage queue tasks: delete, repeat, or add new ones.</p>
        </div>
        <button className="task-refresh" onClick={fetchTasks}>Refresh</button>
      </div>

      <div className="task-panels">
        <form className="task-panel" onSubmit={handleFilterSubmit}>
          <h2>Filter Queue</h2>
          <label>
            Submission ID
            <input
              type="text"
              value={filters.submissionId}
              onChange={(e) => setFilters(prev => ({ ...prev, submissionId: e.target.value }))}
              placeholder="e.g. 8e0a..."
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="">Any</option>
              <option value="pending">pending</option>
              <option value="processing">processing</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label>
            Limit
            <input
              type="number"
              min="1"
              max="500"
              value={filters.limit}
              onChange={(e) => setFilters(prev => ({ ...prev, limit: e.target.value }))}
            />
          </label>
          <button type="submit" className="task-primary">Apply Filters</button>
        </form>

        <form className="task-panel" onSubmit={handleAdd}>
          <h2>Add Task</h2>
          <label>
            Submission ID
            <input
              type="text"
              value={newTask.submissionId}
              onChange={(e) => setNewTask(prev => ({ ...prev, submissionId: e.target.value }))}
              placeholder="Paste submission ID"
            />
          </label>
          <label>
            Task Type
            <select
              value={newTask.taskType}
              onChange={(e) => setNewTask(prev => ({ ...prev, taskType: e.target.value }))}
            >
              {TASK_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Priority (optional)
            <input
              type="number"
              min="1"
              max="10"
              value={newTask.priority}
              onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value }))}
              placeholder="Default priority"
            />
          </label>
          <button type="submit" className="task-primary">Queue Task</button>
        </form>
      </div>

      {actionMessage && (
        <div className="task-message">{actionMessage}</div>
      )}

      {loading ? (
        <div className="task-state">Loading queue...</div>
      ) : error ? (
        <div className="task-state task-error">{error}</div>
      ) : (
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Submission</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan="7" className="task-empty">No tasks match the filters.</td>
                </tr>
              ) : (
                tasks.map(task => (
                  <tr key={task.id}>
                    <td className="task-mono">{task.id}</td>
                    <td className="task-mono">{task.submission_id}</td>
                    <td>{task.task_type}</td>
                    <td>
                      <span className={`task-status task-status-${task.status}`}>{task.status}</span>
                    </td>
                    <td>{task.priority}</td>
                    <td>{task.created_at ? new Date(task.created_at).toLocaleString() : '-'}</td>
                    <td>
                      <div className="task-actions">
                        <button
                          type="button"
                          className="task-secondary"
                          onClick={() => handleRepeat(task.id)}
                        >
                          Repeat
                        </button>
                        <button
                          type="button"
                          className="task-danger"
                          onClick={() => handleDelete(task.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TaskControlPage;
