import React, { useCallback, useEffect, useState } from 'react';
import { appendPositiveIntegerParam, appendStringParam, buildQueryString, readErrorMessage } from '../utils/requestUtils';
import '../styles/App.css';

/**
 * @typedef {Object} CacheNamespace
 * @property {string} namespace
 * @property {number} count
 */

/**
 * @typedef {Object} CacheEntry
 * @property {string | number} id
 * @property {string} [key]
 * @property {string} [prompt_hash]
 * @property {string} [namespace]
 * @property {string} [model_id]
 * @property {number} [temperature]
 * @property {string | number} [created_at]
 * @property {string | number} [stored_at]
 */

/**
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
function formatCacheDate(value) {
  if (!value) {
    return '-';
  }

  if (typeof value === 'number') {
    return new Date(value * 1000).toLocaleString();
  }

  return new Date(value).toLocaleString();
}

function truncateKey(value) {
  return value ? `${value.slice(0, 12)}…` : '-';
}

function CachePage() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [namespaces, setNamespaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [filters, setFilters] = useState({ namespace: '', limit: '50', skip: '0' });

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
   * @returns {Promise<void>}
   */
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/llm-cache/stats');
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setNamespaces(data.namespaces || []);
    } catch {}
  }, []);

  /**
   * @returns {Promise<void>}
   */
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQueryString(function configureParams(params) {
        appendStringParam(params, 'namespace', filters.namespace);
        appendPositiveIntegerParam(params, 'limit', filters.limit);
        appendPositiveIntegerParam(params, 'skip', filters.skip);
      });
      const response = await fetch(`/api/llm-cache?${query}`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unknown error'));
      }

      const data = await response.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(`Failed to load: ${err.message || 'Unknown error'}. Try refreshing.`);
    } finally {
      setLoading(false);
    }
  }, [filters.namespace, filters.limit, filters.skip]);

  useEffect(() => {
    fetchStats();
    fetchEntries();
  }, [fetchStats, fetchEntries]);

  /**
   * @returns {void}
   */
  const refreshCacheData = useCallback(function refreshCacheData() {
    fetchEntries();
    fetchStats();
  }, [fetchEntries, fetchStats]);

  /**
   * @param {string | number} entryId
   * @returns {Promise<void>}
   */
  const handleDeleteEntry = async (entryId) => {
    setActionMessage('');
    try {
      const response = await fetch(`/api/llm-cache/entry/${entryId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Delete failed'));
      }

      setActionMessage('Entry deleted.');
      refreshCacheData();
    } catch (err) {
      setActionMessage(`Delete failed: ${err.message}`);
    }
  };

  /**
   * @returns {Promise<void>}
   */
  const handleClearNamespace = async () => {
    if (!filters.namespace) {
      return;
    }

    if (!window.confirm(`Delete all cache entries for namespace "${filters.namespace}"?`)) {
      return;
    }

    setActionMessage('');
    try {
      const response = await fetch(`/api/llm-cache?namespace=${encodeURIComponent(filters.namespace)}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Clear failed'));
      }

      const data = await response.json();
      setActionMessage(`Cleared ${data.deleted_count} entries from namespace "${filters.namespace}".`);
      refreshCacheData();
    } catch (err) {
      setActionMessage(`Clear failed: ${err.message}`);
    }
  };

  /**
   * @returns {Promise<void>}
   */
  const handleClearAll = async () => {
    if (!window.confirm('Delete ALL cache entries? This cannot be undone.')) {
      return;
    }

    setActionMessage('');
    try {
      const response = await fetch('/api/llm-cache', { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Clear all failed'));
      }

      const data = await response.json();
      setActionMessage(`Cleared ${data.deleted_count} cache entries.`);
      updateFilters('namespace', '');
      refreshCacheData();
    } catch (err) {
      setActionMessage(`Clear all failed: ${err.message}`);
    }
  };

  return (
    <div className="page-stack task-page">
      <div className="task-page-header">
        <div>
          <h1>LLM Cache</h1>
          <p className="task-page-subtitle">Browse and manage cached LLM responses. Total: {total}</p>
        </div>
        <button type="button" className="task-refresh" onClick={refreshCacheData}>Refresh</button>
      </div>

      <div className="task-panels">
        <div className="task-panel">
          <h2>Filter</h2>
          <label>
            Namespace
            <select
              value={filters.namespace}
              onChange={(event) => {
                updateFilters('namespace', event.target.value);
                updateFilters('skip', '0');
              }}
            >
              <option value="">All namespaces</option>
              {namespaces.map((namespace) => (
                <option key={namespace.namespace} value={namespace.namespace}>
                  {namespace.namespace} ({namespace.count})
                </option>
              ))}
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
          <label>
            Skip
            <input
              type="number"
              min="0"
              value={filters.skip}
              onChange={(event) => updateFilters('skip', event.target.value)}
            />
          </label>
        </div>

        <div className="task-panel">
          <h2>Bulk Delete</h2>
          <p className="task-panel-note">
            Remove entries by namespace or clear the entire cache.
          </p>
          <button
            type="button"
            className="task-danger task-danger--block task-danger--spaced"
            onClick={handleClearNamespace}
            disabled={!filters.namespace}
          >
            Clear Namespace {filters.namespace ? `"${filters.namespace}"` : '(select above)'}
          </button>
          <button
            type="button"
            className="task-danger task-danger--block"
            onClick={handleClearAll}
          >
            Clear All Cache
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="task-message">{actionMessage}</div>
      )}

      {loading ? (
        <div className="task-state loading-text">Loading cache entries...</div>
      ) : error ? (
        <div className="task-state task-error">{error}</div>
      ) : (
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Namespace</th>
                <th>Model</th>
                <th>Temperature</th>
                <th>Created</th>
                <th>Stored</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan="7" className="task-empty">No cache entries found.</td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="task-mono" title={entry.key || entry.prompt_hash}>{truncateKey(entry.key || entry.prompt_hash)}</td>
                    <td><span className="task-status task-status-completed">{entry.namespace || '-'}</span></td>
                    <td>{entry.model_id || '-'}</td>
                    <td>{entry.temperature != null ? entry.temperature.toFixed(2) : '-'}</td>
                    <td>{formatCacheDate(entry.created_at)}</td>
                    <td>{entry.stored_at ? new Date(entry.stored_at).toLocaleString() : '-'}</td>
                    <td>
                      <button
                        type="button"
                        className="task-danger"
                        onClick={() => handleDeleteEntry(entry.id)}
                      >
                        Delete
                      </button>
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

export default CachePage;
