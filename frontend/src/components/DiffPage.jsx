import React, { useCallback, useEffect, useMemo, useState } from 'react';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function similarityClass(similarity) {
  const pct = Math.round((similarity || 0) * 100);
  if (pct >= 70) return 'diff-sim-high';
  if (pct >= 25) return 'diff-sim-mid';
  return 'diff-sim-low';
}

function highlightText(text, query) {
  const raw = String(text || '');
  const term = String(query || '').trim().toLowerCase();
  if (!term) return raw;
  const idx = raw.toLowerCase().indexOf(term);
  if (idx < 0) return raw;
  return (
    <>
      {raw.slice(0, idx)}
      <mark>{raw.slice(idx, idx + term.length)}</mark>
      {raw.slice(idx + term.length)}
    </>
  );
}

function DiffPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [submissionsError, setSubmissionsError] = useState('');

  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [diffState, setDiffState] = useState(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [jobLoading, setJobLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

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

  const rows = useMemo(() => {
    const matches = diffState?.diff?.matches_left_to_right || [];
    const unmatchedRight = diffState?.diff?.unmatched_right || [];
    const nearest = diffState?.diff?.nearest_left_to_right || [];
    const nearestMap = {};
    nearest.forEach((entry) => {
      const key = `${entry.left_sentence_index}:${entry.right_sentence_index}`;
      if (!nearestMap[key]) nearestMap[key] = [];
      nearestMap[key].push(entry);
    });

    const matchRows = matches.map((row, index) => {
      const key = `${row.left_sentence_index}:${row.right_sentence_index}`;
      return {
        id: `match-${index}`,
        kind: 'match',
        similarity: row.similarity || 0,
        leftTopic: row.left_topic,
        leftText: row.left_text,
        leftSentenceIndex: row.left_sentence_index,
        rightTopic: row.right_topic,
        rightText: row.right_text,
        rightSentenceIndex: row.right_sentence_index,
        nearest: nearestMap[key] || [],
      };
    });

    const unmatchedRows = unmatchedRight.map((row, index) => ({
      id: `unmatched-right-${index}`,
      kind: 'unmatched-right',
      similarity: 0,
      leftTopic: null,
      leftText: null,
      leftSentenceIndex: null,
      rightTopic: row.topic,
      rightText: row.text,
      rightSentenceIndex: row.sentence_index,
      nearest: [],
    }));

    return [...matchRows, ...unmatchedRows];
  }, [diffState]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
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
  }, [rows, query]);

  useEffect(() => {
    setActiveIndex(filteredRows.length > 0 ? 0 : -1);
  }, [query, filteredRows.length]);

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

  const leftOptions = submissions;
  const rightOptions = submissions;

  return (
    <div className="app diff-page">
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
            {leftOptions.map((submission) => (
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
            {rightOptions.map((submission) => (
              <option key={submission.submission_id} value={submission.submission_id}>
                {submission.source_url || '(no source)'} [{submission.submission_id.slice(0, 8)}] {formatDate(submission.created_at)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {submissionsError && <div className="text-list-message text-list-error">{submissionsError}</div>}
      {diffError && <div className="text-list-message text-list-error">{diffError}</div>}

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
            {['missing', 'failed', 'stale'].includes(diffState.state) && (
              <div className="diff-actions">
                <button className="text-list-primary" onClick={() => runCalculation(false)} disabled={jobLoading}>
                  {jobLoading ? '...' : 'Calculate diff'}
                </button>
                <button className="action-btn" onClick={() => runCalculation(true)} disabled={jobLoading}>
                  {jobLoading ? '...' : 'Recalculate'}
                </button>
              </div>
            )}
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
                      {row.leftText ? (
                        <>
                          <div className="diff-topic">{row.leftTopic}</div>
                          <div className="diff-meta">Sentence #{(row.leftSentenceIndex ?? -1) + 1}</div>
                          <div>{highlightText(row.leftText, query)}</div>
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
                      ) : (
                        <span className="diff-sim diff-sim-new">NEW</span>
                      )}
                    </div>
                    <div className="diff-cell diff-right">
                      {row.rightText ? (
                        <>
                          <div className="diff-topic">{row.rightTopic}</div>
                          <div className="diff-meta">Sentence #{(row.rightSentenceIndex ?? -1) + 1}</div>
                          <div>{highlightText(row.rightText, query)}</div>
                        </>
                      ) : (
                        <div className="diff-empty">No match on right</div>
                      )}
                      {row.nearest.length > 0 && (
                        <div className="diff-nearest">
                          {row.nearest.map((item, idx) => (
                            <span key={`${row.id}-nearest-${idx}`} className="diff-nearest-chip">
                              Near: {Math.round((item.similarity || 0) * 100)}%
                            </span>
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
