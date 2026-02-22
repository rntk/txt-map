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
    const nearestLeftToRight = diffState?.diff?.nearest_left_to_right || [];
    const nearestRightToLeft = diffState?.diff?.nearest_right_to_left || [];
    const nearestLeftMap = {};
    const nearestRightMap = {};

    const addLeftToRightEdge = (entry) => {
      if (entry.left_sentence_index == null || entry.right_sentence_index == null) return;
      const leftKey = String(entry.left_sentence_index);
      if (!nearestLeftMap[leftKey]) nearestLeftMap[leftKey] = [];
      nearestLeftMap[leftKey].push({
        left_sentence_index: entry.left_sentence_index,
        right_sentence_index: entry.right_sentence_index,
        left_topic: entry.left_topic || null,
        right_topic: entry.right_topic || null,
        similarity: entry.similarity || 0,
      });
    };

    const addRightToLeftEdge = (entry) => {
      if (entry.right_sentence_index == null || entry.left_sentence_index == null) return;
      const rightKey = String(entry.right_sentence_index);
      if (!nearestRightMap[rightKey]) nearestRightMap[rightKey] = [];
      nearestRightMap[rightKey].push({
        right_sentence_index: entry.right_sentence_index,
        left_sentence_index: entry.left_sentence_index,
        right_topic: entry.right_topic || null,
        left_topic: entry.left_topic || null,
        similarity: entry.similarity || 0,
      });
    };

    // Build an undirected nearest graph: each similarity relation must be navigable both ways.
    nearestLeftToRight.forEach((entry) => {
      addLeftToRightEdge(entry);
      addRightToLeftEdge(entry);
    });

    nearestRightToLeft.forEach((entry) => {
      addRightToLeftEdge(entry);
      addLeftToRightEdge(entry);
    });

    const matchRows = matches.map((row, index) => {
      const hasLeft = row.left_sentence_index != null;
      const hasRight = row.right_sentence_index != null;
      const leftKey = String(row.left_sentence_index);
      const rightKey = String(row.right_sentence_index);
      const rawNearestRight = nearestLeftMap[leftKey] || [];
      const rawNearestLeft = nearestRightMap[rightKey] || [];

      const dedupRight = new Map();
      rawNearestRight.forEach((candidate) => {
        if (candidate.right_sentence_index == null) return;
        if (candidate.right_sentence_index === row.right_sentence_index) return;
        const existing = dedupRight.get(candidate.right_sentence_index);
        if (!existing || (candidate.similarity || 0) > (existing.similarity || 0)) {
          dedupRight.set(candidate.right_sentence_index, candidate);
        }
      });
      const nearestRightLinks = Array.from(dedupRight.values())
        .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
        .slice(0, 5);

      const dedupLeft = new Map();
      rawNearestLeft.forEach((candidate) => {
        if (candidate.left_sentence_index == null) return;
        if (candidate.left_sentence_index === row.left_sentence_index) return;
        const existing = dedupLeft.get(candidate.left_sentence_index);
        if (!existing || (candidate.similarity || 0) > (existing.similarity || 0)) {
          dedupLeft.set(candidate.left_sentence_index, candidate);
        }
      });
      const nearestLeftLinks = Array.from(dedupLeft.values())
        .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
        .slice(0, 5);

      return {
        id: `match-${index}`,
        kind: hasLeft && hasRight ? 'match' : 'unmatched-left',
        hasLeft,
        hasRight,
        similarity: hasLeft && hasRight ? row.similarity || 0 : 0,
        leftTopic: row.left_topic,
        leftText: row.left_text,
        leftSentenceIndex: row.left_sentence_index,
        rightTopic: row.right_topic,
        rightText: row.right_text,
        rightSentenceIndex: row.right_sentence_index,
        nearestRight: nearestRightLinks,
        nearestLeft: nearestLeftLinks,
      };
    });

    const unmatchedRows = unmatchedRight.map((row, index) => {
      const rightKey = String(row.sentence_index);
      const rawNearestLeft = nearestRightMap[rightKey] || [];
      const dedupLeft = new Map();
      rawNearestLeft.forEach((candidate) => {
        if (candidate.left_sentence_index == null) return;
        const existing = dedupLeft.get(candidate.left_sentence_index);
        if (!existing || (candidate.similarity || 0) > (existing.similarity || 0)) {
          dedupLeft.set(candidate.left_sentence_index, candidate);
        }
      });

      return {
        id: `unmatched-right-${index}`,
        kind: 'unmatched-right',
        hasLeft: false,
        hasRight: true,
        similarity: 0,
        leftTopic: null,
        leftText: null,
        leftSentenceIndex: null,
        rightTopic: row.topic,
        rightText: row.text,
        rightSentenceIndex: row.sentence_index,
        nearestRight: [],
        nearestLeft: Array.from(dedupLeft.values())
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, 5),
      };
    });

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
    if (!pendingJumpRowId || query.trim() !== '') return;
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
