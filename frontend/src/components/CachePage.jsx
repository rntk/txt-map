import React, { useCallback, useEffect, useState } from 'react';
import '../styles/App.css';

function CachePage() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [namespaces, setNamespaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [filters, setFilters] = useState({ namespace: '', limit: '50', skip: '0' });

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/llm-cache/stats');
      if (!res.ok) return;
      const data = await res.json();
      setNamespaces(data.namespaces || []);
    } catch (_) {}
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.namespace) params.append('namespace', filters.namespace);
      const limit = parseInt(filters.limit, 10);
      if (limit > 0) params.append('limit', String(limit));
      const skip = parseInt(filters.skip, 10);
      if (skip > 0) params.append('skip', String(skip));
      const res = await fetch(`/api/llm-cache?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
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

  const handleDeleteEntry = async (entryId) => {
    setActionMessage('');
    try {
      const res = await fetch(`/api/llm-cache/entry/${entryId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setActionMessage('Entry deleted.');
      fetchEntries();
      fetchStats();
    } catch (err) {
      setActionMessage(`Delete failed: ${err.message}`);
    }
  };

  const handleClearNamespace = async () => {
    if (!filters.namespace) return;
    if (!window.confirm(`Delete all cache entries for namespace "${filters.namespace}"?`)) return;
    setActionMessage('');
    try {
      const res = await fetch(`/api/llm-cache?namespace=${encodeURIComponent(filters.namespace)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setActionMessage(`Cleared ${data.deleted_count} entries from namespace "${filters.namespace}".`);
      fetchEntries();
      fetchStats();
    } catch (err) {
      setActionMessage(`Clear failed: ${err.message}`);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete ALL cache entries? This cannot be undone.')) return;
    setActionMessage('');
    try {
      const res = await fetch('/api/llm-cache', { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setActionMessage(`Cleared ${data.deleted_count} cache entries.`);
      setFilters(prev => ({ ...prev, namespace: '' }));
      fetchEntries();
      fetchStats();
    } catch (err) {
      setActionMessage(`Clear all failed: ${err.message}`);
    }
  };

  const formatDate = (val) => {
    if (!val) return '-';
    // created_at is a Unix timestamp (float), stored_at is ISO string
    if (typeof val === 'number') return new Date(val * 1000).toLocaleString();
    return new Date(val).toLocaleString();
  };

  const truncateKey = (key) => key ? `${key.slice(0, 12)}…` : '-';

  return (
    <div className="app task-page">
      <div className="task-page-header">
        <div>
          <h1>LLM Cache</h1>
          <p className="task-page-subtitle">Browse and manage cached LLM responses. Total: {total}</p>
        </div>
        <button className="task-refresh" onClick={() => { fetchEntries(); fetchStats(); }}>Refresh</button>
      </div>

      <div className="task-panels">
        <div className="task-panel">
          <h2>Filter</h2>
          <label>
            Namespace
            <select
              value={filters.namespace}
              onChange={(e) => setFilters(prev => ({ ...prev, namespace: e.target.value, skip: '0' }))}
            >
              <option value="">All namespaces</option>
              {namespaces.map(ns => (
                <option key={ns.namespace} value={ns.namespace}>
                  {ns.namespace} ({ns.count})
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
              onChange={(e) => setFilters(prev => ({ ...prev, limit: e.target.value }))}
            />
          </label>
          <label>
            Skip
            <input
              type="number"
              min="0"
              value={filters.skip}
              onChange={(e) => setFilters(prev => ({ ...prev, skip: e.target.value }))}
            />
          </label>
        </div>

        <div className="task-panel">
          <h2>Bulk Delete</h2>
          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
            Remove entries by namespace or clear the entire cache.
          </p>
          <button
            className="task-danger"
            onClick={handleClearNamespace}
            disabled={!filters.namespace}
            style={{ marginBottom: '0.5rem', width: '100%' }}
          >
            Clear Namespace {filters.namespace ? `"${filters.namespace}"` : '(select above)'}
          </button>
          <button
            className="task-danger"
            onClick={handleClearAll}
            style={{ width: '100%' }}
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
                entries.map(entry => (
                  <tr key={entry.id}>
                    <td className="task-mono" title={entry.key || entry.prompt_hash}>{truncateKey(entry.key || entry.prompt_hash)}</td>
                    <td><span className="task-status task-status-completed">{entry.namespace || '-'}</span></td>
                    <td>{entry.model_id || '-'}</td>
                    <td>{entry.temperature != null ? entry.temperature.toFixed(2) : '-'}</td>
                    <td>{formatDate(entry.created_at)}</td>
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
