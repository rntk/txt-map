import React, { useCallback, useEffect, useState } from 'react';
import '../styles/App.css';

const STATUS_OPTIONS = ['pending', 'processing', 'completed', 'failed'];

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function statusClass(status) {
  return `task-status task-status-${status || 'pending'}`;
}

function TextListPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    submissionId: '',
    status: '',
    limit: '100'
  });

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.submissionId) params.append('submission_id', filters.submissionId.trim());
    if (filters.status) params.append('status', filters.status);
    const limit = Number.parseInt(filters.limit, 10);
    if (Number.isFinite(limit) && limit > 0) params.append('limit', String(limit));
    return params.toString();
  }, [filters.submissionId, filters.status, filters.limit]);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery();
      const response = await fetch(`http://127.0.0.1:8000/api/submissions?${query}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setSubmissions(data.submissions || []);
    } catch (err) {
      setError(err.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleFilterSubmit = (event) => {
    event.preventDefault();
    fetchSubmissions();
  };

  return (
    <div className="app text-list-page">
      <div className="text-list-header">
        <div>
          <h1>Text Submissions</h1>
          <p className="text-list-subtitle">Browse text submissions stored in the database.</p>
        </div>
        <button className="text-list-refresh" onClick={fetchSubmissions}>Refresh</button>
      </div>

      <form className="text-list-filters" onSubmit={handleFilterSubmit}>
        <label>
          Submission ID
          <input
            type="text"
            value={filters.submissionId}
            onChange={(e) => setFilters(prev => ({ ...prev, submissionId: e.target.value }))}
            placeholder="Paste submission ID"
          />
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="">Any</option>
            {STATUS_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
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
        <button type="submit" className="text-list-primary">Apply Filters</button>
      </form>

      {error && <div className="text-list-message text-list-error">{error}</div>}
      {loading && <div className="text-list-message">Loading submissions...</div>}

      {!loading && submissions.length === 0 && !error && (
        <div className="text-list-message">No submissions found.</div>
      )}

      {!loading && submissions.length > 0 && (
        <div className="text-list-table-wrapper">
          <table className="text-list-table">
            <thead>
              <tr>
                <th>Submission ID</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Source</th>
                <th>Chars</th>
                <th>Sentences</th>
                <th>Topics</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.submission_id}>
                  <td className="task-mono">{submission.submission_id}</td>
                  <td>
                    <span className={statusClass(submission.overall_status)}>
                      {submission.overall_status || 'pending'}
                    </span>
                  </td>
                  <td>{formatDate(submission.created_at)}</td>
                  <td>{formatDate(submission.updated_at)}</td>
                  <td className="text-list-source">
                    {submission.source_url ? (
                      <a href={submission.source_url} target="_blank" rel="noopener noreferrer">
                        {submission.source_url}
                      </a>
                    ) : (
                      <span className="text-list-muted">(none)</span>
                    )}
                  </td>
                  <td>{(submission.text_characters || 0).toLocaleString()}</td>
                  <td>{(submission.sentence_count || 0).toLocaleString()}</td>
                  <td>{(submission.topic_count || 0).toLocaleString()}</td>
                  <td>
                    <a className="text-list-link" href={`/page/text/${submission.submission_id}`}>Open</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TextListPage;
