import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, similarityClass, highlightText } from '../utils/diffUtils.jsx';
import { buildDiffRows } from '../utils/diffRowBuilder';

function DiffPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [submissionsError, setSubmissionsError] = useState('');

  const [leftId, setLeftId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('left') || '';
  });
  const [rightId, setRightId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('right') || '';
  });
  const [diffState, setDiffState] = useState(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [diffMessage, setDiffMessage] = useState('');
  const [jobLoading, setJobLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pendingJumpRowId, setPendingJumpRowId] = useState(null);

  const fetchSubmissions = useCallback(async () => {
    setLoadingSubmissions(true);
    setSubmissionsError('');
    try {
      const response = await fetch('/api/submissions?limit=500');
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setSubmissions(data.submissions || []);
    } catch (error) {
      setSubmissionsError(error.message || 'Failed to load documents');
    } finally {
      setLoadingSubmissions(false);
    }
  }, []);

  const fetchDiff = useCallback(async () => {
    if (!leftId || !rightId || leftId === rightId) {
      setDiffState(null);
      return;
    }
    setLoadingDiff(true);
    setDiffError('');
    try {
      const params = new URLSearchParams({
        left_submission_id: leftId,
        right_submission_id: rightId,
      });
      const response = await fetch(`/api/diff?${params.toString()}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setDiffState(data);
    } catch (error) {
      setDiffError(error.message || 'Failed to load diff');
      setDiffState(null);
    } finally {
      setLoadingDiff(false);
    }
  }, [leftId, rightId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!diffState || !leftId || !rightId) return undefined;
    const state = diffState.state;
    if (!['waiting_prerequisites', 'queued', 'processing'].includes(state)) return undefined;
    const timer = setInterval(() => {
      fetchDiff();
    }, 3000);
    return () => clearInterval(timer);
  }, [diffState, fetchDiff, leftId, rightId]);

  const runCalculation = useCallback(async (force = false) => {
    if (!leftId || !rightId || leftId === rightId) return;
    setJobLoading(true);
    setDiffError('');
    setDiffMessage('');
    try {
      const response = await fetch('/api/diff/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          left_submission_id: leftId,
          right_submission_id: rightId,
          force,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await fetchDiff();
    } catch (error) {
      setDiffError(error.message || 'Failed to queue calculation');
    } finally {
      setJobLoading(false);
    }
  }, [fetchDiff, leftId, rightId]);

  const deleteDiffData = useCallback(async () => {
    if (!leftId || !rightId || leftId === rightId) return;

    const shouldDelete = window.confirm('Delete stored semantic diff data for this pair? This removes cached diff results and queued/completed diff jobs for these two documents.');
    if (!shouldDelete) return;

    setDeleteLoading(true);
    setDiffError('');
    setDiffMessage('');
    try {
      const params = new URLSearchParams({
        left_submission_id: leftId,
        right_submission_id: rightId,
      });
      const response = await fetch(`/api/diff?${params.toString()}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      await fetchDiff();
      setDiffMessage(`Deleted diff data (${data.deleted_diff_count || 0} diff docs, ${data.deleted_job_count || 0} jobs).`);
    } catch (error) {
      setDiffError(error.message || 'Failed to delete diff data');
    } finally {
      setDeleteLoading(false);
    }
  }, [fetchDiff, leftId, rightId]);

  const rows = useMemo(() => buildDiffRows(diffState), [diffState]);

  const filteredRows = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const hay = [
        row.leftTopic,
        row.leftText,
        row.rightTopic,
        row.rightText,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return hay.includes(needle);
    });
  }, [rows, debouncedQuery]);

  useEffect(() => {
    setActiveIndex(filteredRows.length > 0 ? 0 : -1);
  }, [debouncedQuery, filteredRows.length]);

  useEffect(() => {
    if (!pendingJumpRowId || debouncedQuery.trim() !== '') return;
    const targetIndex = filteredRows.findIndex((row) => row.id === pendingJumpRowId);
    if (targetIndex >= 0) {
      setActiveIndex(targetIndex);
    }
    setPendingJumpRowId(null);
  }, [filteredRows, pendingJumpRowId, query]);

  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= filteredRows.length) return;
    const row = document.getElementById(`diff-row-${filteredRows[activeIndex].id}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, filteredRows]);

  const navigate = (delta) => {
    if (!filteredRows.length) return;
    setActiveIndex((prev) => {
      const current = prev < 0 ? 0 : prev;
      return (current + delta + filteredRows.length) % filteredRows.length;
    });
  };

  const jumpToRightSentence = useCallback((sentenceIndex) => {
    if (sentenceIndex == null) return;
    const targetInFiltered = filteredRows.findIndex((row) => row.rightSentenceIndex === sentenceIndex);
    if (targetInFiltered >= 0) {
      setActiveIndex(targetInFiltered);
      return;
    }

    const targetInAll = rows.find((row) => row.rightSentenceIndex === sentenceIndex);
    if (!targetInAll) return;
    setQuery('');
    setPendingJumpRowId(targetInAll.id);
  }, [filteredRows, rows]);

  const jumpToLeftSentence = useCallback((sentenceIndex) => {
    if (sentenceIndex == null) return;
    const targetInFiltered = filteredRows.findIndex((row) => row.leftSentenceIndex === sentenceIndex);
    if (targetInFiltered >= 0) {
      setActiveIndex(targetInFiltered);
      return;
    }

    const targetInAll = rows.find((row) => row.leftSentenceIndex === sentenceIndex);
    if (!targetInAll) return;
    setQuery('');
    setPendingJumpRowId(targetInAll.id);
  }, [filteredRows, rows]);

  return (
    <div className="page-stack diff-page">
      <div className="diff-page-header">
        <div>
          <h1>Semantic Diff</h1>
          <p className="diff-page-subtitle">Topic-aware comparison between two documents.</p>
        </div>
        <button className="text-list-refresh" onClick={fetchSubmissions} disabled={loadingSubmissions}>
          Refresh docs
        </button>
      </div>

      <div className="diff-selectors">
        <label>
          Left document
          <select value={leftId} onChange={(event) => setLeftId(event.target.value)}>
            <option value="">Select document</option>
            {submissions.map((submission) => (
              <option key={submission.submission_id} value={submission.submission_id}>
                {submission.source_url || '(no source)'} [{submission.submission_id.slice(0, 8)}] {formatDate(submission.created_at)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Right document
          <select value={rightId} onChange={(event) => setRightId(event.target.value)}>
            <option value="">Select document</option>
            {submissions.map((submission) => (
              <option key={submission.submission_id} value={submission.submission_id}>
                {submission.source_url || '(no source)'} [{submission.submission_id.slice(0, 8)}] {formatDate(submission.created_at)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {submissionsError && <div className="text-list-message text-list-error">{submissionsError}</div>}
      {diffError && <div className="text-list-message text-list-error">{diffError}</div>}
      {diffMessage && <div className="text-list-message">{diffMessage}</div>}

      {leftId && rightId && leftId === rightId && (
        <div className="text-list-message text-list-error">Left and right documents must be different.</div>
      )}

      {loadingDiff && <div className="text-list-message">Loading diff...</div>}

      {!loadingDiff && diffState && (
        <div className="diff-content">
          <div className="diff-state-card">
            <div><strong>State:</strong> {diffState.state}</div>
            {diffState.stale_reasons?.length > 0 && (
              <div><strong>Stale reasons:</strong> {diffState.stale_reasons.join(', ')}</div>
            )}
            {diffState.latest_job && (
              <div><strong>Latest job:</strong> {diffState.latest_job.status}</div>
            )}
            {diffState.state === 'waiting_prerequisites' && (
              <div className="diff-prereq">
                <div>
                  <strong>Left ready:</strong> {String(diffState.prereq?.left?.ready)}
                  {!diffState.prereq?.left?.ready && ` (${(diffState.prereq?.left?.missing || []).join(', ')})`}
                </div>
                <div>
                  <strong>Right ready:</strong> {String(diffState.prereq?.right?.ready)}
                  {!diffState.prereq?.right?.ready && ` (${(diffState.prereq?.right?.missing || []).join(', ')})`}
                </div>
                <div>Waiting until topic/sentence prerequisites are ready.</div>
              </div>
            )}
            <div className="diff-actions">
              {['missing', 'failed', 'stale'].includes(diffState.state) && (
                <>
                  <button className="text-list-primary" onClick={() => runCalculation(false)} disabled={jobLoading || deleteLoading}>
                    {jobLoading ? '...' : 'Calculate diff'}
                  </button>
                  <button className="action-btn" onClick={() => runCalculation(true)} disabled={jobLoading || deleteLoading}>
                    {jobLoading ? '...' : 'Recalculate'}
                  </button>
                </>
              )}
              <button
                className="action-btn danger"
                onClick={deleteDiffData}
                disabled={!leftId || !rightId || leftId === rightId || jobLoading || deleteLoading}
              >
                {deleteLoading ? 'Deleting...' : 'Delete diff data'}
              </button>
            </div>
          </div>

          {diffState.diff && (
            <>
              <div className="diff-toolbar">
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by topic/text"
                />
                <div className="diff-nav">
                  <button type="button" onClick={() => navigate(-1)} disabled={filteredRows.length === 0}>Prev</button>
                  <span>{filteredRows.length ? `${activeIndex + 1}/${filteredRows.length}` : '0/0'}</span>
                  <button type="button" onClick={() => navigate(1)} disabled={filteredRows.length === 0}>Next</button>
                </div>
              </div>

              <div className="diff-grid">
                {filteredRows.map((row, index) => (
                  <div
                    key={row.id}
                    className={`diff-row ${index === activeIndex ? 'active' : ''}`}
                    id={`diff-row-${row.id}`}
                  >
                    <div className="diff-cell diff-left">
                      {row.hasLeft ? (
                        <>
                          <div className="diff-topic">{row.leftTopic}</div>
                          <div className="diff-meta">Sentence #{(row.leftSentenceIndex ?? -1) + 1}</div>
                          <div>{highlightText(row.leftText, query)}</div>
                          {row.nearestRight.length > 0 && (
                            <div className="diff-nearest">
                              {row.nearestRight.map((item, idx) => (
                                <button
                                  type="button"
                                  key={`${row.id}-nearest-right-from-left-${idx}`}
                                  className="diff-nearest-chip diff-nearest-link"
                                  onClick={() => jumpToRightSentence(item.right_sentence_index)}
                                  title={`Go to right sentence #${(item.right_sentence_index ?? -1) + 1}`}
                                >
                                  Similar: {item.right_topic || '(untitled)'} · #{(item.right_sentence_index ?? -1) + 1} ({Math.round((item.similarity || 0) * 100)}%)
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="diff-empty">No match on left</div>
                      )}
                    </div>
                    <div className="diff-center">
                      {row.kind === 'match' ? (
                        <span className={`diff-sim ${similarityClass(row.similarity)}`}>
                          {Math.round((row.similarity || 0) * 100)}%
                        </span>
                      ) : row.kind === 'unmatched-right' ? (
                        <span className="diff-sim diff-sim-new">NEW</span>
                      ) : (
                        <span className="diff-sim diff-sim-low">NO MATCH</span>
                      )}
                    </div>
                    <div className="diff-cell diff-right">
                      {row.hasRight ? (
                        <>
                          <div className="diff-topic">{row.rightTopic}</div>
                          <div className="diff-meta">Sentence #{(row.rightSentenceIndex ?? -1) + 1}</div>
                          <div>{highlightText(row.rightText, query)}</div>
                        </>
                      ) : (
                        <div className="diff-empty">No match on right</div>
                      )}
                      {row.nearestLeft.length > 0 && (
                        <div className="diff-nearest">
                          {row.nearestLeft.map((item, idx) => (
                            <button
                              type="button"
                              key={`${row.id}-nearest-left-from-right-${idx}`}
                              className="diff-nearest-chip diff-nearest-link"
                              onClick={() => jumpToLeftSentence(item.left_sentence_index)}
                              title={`Go to left sentence #${(item.left_sentence_index ?? -1) + 1}`}
                            >
                              Similar: {item.left_topic || '(untitled)'} · #{(item.left_sentence_index ?? -1) + 1} ({Math.round((item.similarity || 0) * 100)}%)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default DiffPage;
