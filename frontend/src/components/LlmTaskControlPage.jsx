import React, { useCallback, useEffect, useState } from 'react';
import { formatDate } from '../utils/chartConstants';
import { appendPositiveIntegerParam, appendStringParam, buildQueryString, readErrorMessage } from '../utils/requestUtils';
import '../styles/App.css';

function LlmTaskControlPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    limit: '100'
  });
  const [actionMessage, setActionMessage] = useState('');

  /**
   * @param {string} field
   * @param {string} value
   * @returns {void}
   */
  const updateFilters = useCallback(function updateFilters(field, value) {
    setFilters(function applyFilterUpdate(previousFilters) {
      return { ...previousFilters, [field]: value };
    });
  }, []);

  /**
   * @returns {string}
   */
  const buildQuery = useCallback(() => {
    return buildQueryString(function configureParams(params) {
      appendStringParam(params, 'status', filters.status);
      appendPositiveIntegerParam(params, 'limit', filters.limit);
    });
  }, [filters.status, filters.limit]);

  /**
   * @returns {Promise<void>}
   */
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery();
      const response = await fetch(`/api/llm-queue?${query}`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to load LLM tasks'));
      }
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err.message || 'Failed to load LLM tasks');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  /**
   * @param {string} requestId
   * @returns {Promise<void>}
   */
  const handleDelete = async (requestId) => {
    setActionMessage('');
    try {
      const response = await fetch(`/api/llm-queue/${requestId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Delete failed'));
      }
      setActionMessage('LLM task deleted.');
      fetchTasks();
    } catch (err) {
      setActionMessage(`Delete failed: ${err.message}`);
    }
  };

  /**
   * @param {React.FormEvent<HTMLFormElement>} event
   * @returns {void}
   */
  const handleFilterSubmit = (event) => {
    event.preventDefault();
    fetchTasks();
  };

  return (
    <div className="page-stack task-page">
      <div className="task-page-header">
        <div>
          <h1>LLM Tasks</h1>
          <p className="task-page-subtitle">Manage LLM queue tasks.</p>
        </div>
        <button type="button" className="task-refresh" onClick={fetchTasks}>Refresh</button>
      </div>

      <div className="task-panels">
        <form className="task-panel" onSubmit={handleFilterSubmit}>
          <h2>Filter Queue</h2>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => updateFilters('status', event.target.value)}
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
              onChange={(event) => updateFilters('limit', event.target.value)}
            />
          </label>
          <button type="submit" className="task-primary">Apply Filters</button>
        </form>
      </div>

      {actionMessage && (
        <div className="task-message">{actionMessage}</div>
      )}

      {loading ? (
        <div className="task-state loading-text">Loading LLM queue...</div>
      ) : error ? (
        <div className="task-state task-error">{error}</div>
      ) : (
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Status</th>
                <th>Model ID</th>
                <th>Temp</th>
                <th>Worker ID</th>
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
                tasks.map((task) => (
                  <tr key={task.request_id}>
                    <td className="task-mono">
                      <span className="task-mono__value" title={task.request_id}>
                        {task.request_id?.slice(0, 8) ?? task.request_id}…
                      </span>
                    </td>
                    <td>
                      <span className={`task-status task-status-${task.status}`}>{task.status}</span>
                    </td>
                    <td>{task.model_id || '-'}</td>
                    <td>{task.temperature != null ? task.temperature : '-'}</td>
                    <td>{task.worker_id || '-'}</td>
                    <td>{formatDate(task.created_at)}</td>
                    <td>
                      <div className="task-actions">
                        <button
                          type="button"
                          className="task-danger"
                          onClick={() => handleDelete(task.request_id)}
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

export default LlmTaskControlPage;
