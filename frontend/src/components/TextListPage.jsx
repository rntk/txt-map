import React, { useCallback, useEffect, useState } from 'react';
import ArticleReadProgress from './ArticleReadProgress';
import GlobalReadProgress from './GlobalReadProgress';
import RefreshButton from './shared/RefreshButton';
import { formatDate } from '../utils/chartConstants';
import { appendPositiveIntegerParam, appendStringParam, buildQueryString, readErrorMessage } from '../utils/requestUtils';
import '../styles/App.css';

const STATUS_OPTIONS = ['pending', 'processing', 'completed', 'failed'];

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

  const updateFilters = useCallback(function updateFilters(field, value) {
    setFilters(function applyFilterUpdate(previousFilters) {
      return { ...previousFilters, [field]: value };
    });
  }, []);

  const buildQuery = useCallback(() => {
    return buildQueryString(function configureParams(params) {
      appendStringParam(params, 'submission_id', filters.submissionId, { trim: true });
      appendStringParam(params, 'status', filters.status);
      appendPositiveIntegerParam(params, 'limit', filters.limit);
    });
  }, [filters.submissionId, filters.status, filters.limit]);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery();
      const response = await fetch(`/api/submissions?${query}`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to load submissions'));
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
    <div className="page-stack text-list-page">
      <div className="text-list-header">
        <div>
          <h1>Text Submissions</h1>
          <p className="text-list-subtitle">Browse text submissions stored in the database.</p>
        </div>
        <div className="page-header-actions page-header-actions--center">
          <GlobalReadProgress size={120} />
          <button className="text-list-refresh" onClick={fetchSubmissions}>Refresh</button>
        </div>
      </div>

      <form className="text-list-filters" onSubmit={handleFilterSubmit}>
        <label>
          Submission ID
          <input
            type="text"
            value={filters.submissionId}
            onChange={(event) => updateFilters('submissionId', event.target.value)}
            placeholder="Paste submission ID"
          />
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) => updateFilters('status', event.target.value)}
          >
            <option value="">Any</option>
            {STATUS_OPTIONS.map((option) => (
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
            onChange={(event) => updateFilters('limit', event.target.value)}
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
                <th>Date</th>
                <th>Source</th>
                <th>Chars</th>
                <th>Sentences</th>
                <th>Topics</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.submission_id}>
                  <td className="task-mono">
                    <a className="text-list-id-link" href={`/page/text/${submission.submission_id}`}>
                      {submission.submission_id}
                    </a>
                  </td>
                  <td>
                    <span className={statusClass(submission.overall_status)}>
                      {submission.overall_status || 'pending'}
                    </span>
                  </td>
                  <td className="text-list-date-cell">
                    <div className="text-list-date-row">
                      <span className="text-list-date-label" title="Created">Created:</span>
                      <span>{formatDate(submission.created_at)}</span>
                    </div>
                    <div className="text-list-date-row">
                      <span className="text-list-date-label" title="Updated">Updated:</span>
                      <span>{formatDate(submission.updated_at)}</span>
                    </div>
                  </td>
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
                    <ArticleReadProgress submissionId={submission.submission_id} />
                  </td>
                  <td>
                    <div className="text-list-actions">
                      <a className="text-list-link" href={`/page/text/${submission.submission_id}`}>Open</a>
                      <RefreshButton
                        submissionId={submission.submission_id}
                        onRefresh={fetchSubmissions}
                        compact={true}
                      />
                    </div>
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
