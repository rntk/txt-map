import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, similarityClass, highlightText } from '../utils/diffUtils.jsx';

function DiffPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [submissionsError, setSubmissionsError] = useState('');

  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [diffState, setDiffState] = useState(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [diffMessage, setDiffMessage] = useState('');
  const [jobLoading, setJobLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const rows = useMemo(() => {
    if (!diffState?.diff) return [];

    const leftNodes = new Map();
    const rightNodes = new Map();
    const allEdges = [];

    const processRow = (row) => {
      if (!row) return;
      if (row.left_sentence_index != null) {
        leftNodes.set(row.left_sentence_index, {
          topic: row.left_topic,
          text: row.left_text,
          index: row.left_sentence_index
        });
      }
      if (row.right_sentence_index != null) {
        rightNodes.set(row.right_sentence_index, {
          topic: row.right_topic,
          text: row.right_text,
          index: row.right_sentence_index
        });
      }
      if (row.left_sentence_index != null && row.right_sentence_index != null && row.similarity != null && row.similarity > 0) {
        allEdges.push({ left: row.left_sentence_index, right: row.right_sentence_index, sim: row.similarity });
      }
    };

    (diffState.diff.matches_left_to_right || []).forEach(processRow);
    (diffState.diff.matches_right_to_left || []).forEach(processRow);
    (diffState.diff.nearest_left_to_right || []).forEach(processRow);
    (diffState.diff.nearest_right_to_left || []).forEach(processRow);
    (diffState.diff.unmatched_left || []).forEach(processRow);
    (diffState.diff.unmatched_right || []).forEach(processRow);

    const dedupEdges = new Map();
    allEdges.forEach(e => {
      const k = `${e.left}-${e.right}`;
      if (!dedupEdges.has(k) || dedupEdges.get(k).sim < e.sim) {
        dedupEdges.set(k, e);
      }
    });
    const sortedEdges = Array.from(dedupEdges.values()).sort((a, b) => b.sim - a.sim);

    const nearestRightMap = {};
    const nearestLeftMap = {};

    sortedEdges.forEach((e) => {
      if (!nearestRightMap[e.left]) nearestRightMap[e.left] = [];
      nearestRightMap[e.left].push({
        right_sentence_index: e.right,
        similarity: e.sim,
        right_topic: rightNodes.get(e.right)?.topic
      });

      if (!nearestLeftMap[e.right]) nearestLeftMap[e.right] = [];
      nearestLeftMap[e.right].push({
        left_sentence_index: e.left,
        similarity: e.sim,
        left_topic: leftNodes.get(e.left)?.topic
      });
    });

    const renderedLeft = new Set();
    const renderedRight = new Set();
    const displayRows = [];

    // Phase 1: greedy pairing
    sortedEdges.forEach(e => {
      if (!renderedLeft.has(e.left) && !renderedRight.has(e.right)) {
        renderedLeft.add(e.left);
        renderedRight.add(e.right);
        displayRows.push({
          hasLeft: true,
          hasRight: true,
          leftData: leftNodes.get(e.left),
          rightData: rightNodes.get(e.right),
          similarity: e.sim
        });
      }
    });

    // Phase 2: Add remaining unrendered left nodes
    Array.from(leftNodes.values()).forEach((node) => {
      if (!renderedLeft.has(node.index)) {
        displayRows.push({
          hasLeft: true,
          hasRight: false,
          leftData: node,
          rightData: null,
          similarity: 0
        });
      }
    });

    // Phase 3: Add remaining unrendered right nodes
    Array.from(rightNodes.values()).forEach((node) => {
      if (!renderedRight.has(node.index)) {
        displayRows.push({
          hasLeft: false,
          hasRight: true,
          leftData: null,
          rightData: node,
          similarity: 0
        });
      }
    });

    // Sort displayRows by left sentence index, then right sentence index
    displayRows.sort((a, b) => {
      const aLeft = a.hasLeft ? a.leftData.index : Infinity;
      const bLeft = b.hasLeft ? b.leftData.index : Infinity;
      if (aLeft !== bLeft) return aLeft - bLeft;

      const aRight = a.hasRight ? a.rightData.index : Infinity;
      const bRight = b.hasRight ? b.rightData.index : Infinity;
      return aRight - bRight;
    });

    return displayRows.map((row, index) => {
      let nearestRight = [];
      if (row.hasLeft) {
        const allRight = nearestRightMap[row.leftData.index] || [];
        nearestRight = allRight.filter(r => !row.hasRight || r.right_sentence_index !== row.rightData.index).slice(0, 5);
      }

      let nearestLeft = [];
      if (row.hasRight) {
        const allLeft = nearestLeftMap[row.rightData.index] || [];
        nearestLeft = allLeft.filter(l => !row.hasLeft || l.left_sentence_index !== row.leftData.index).slice(0, 5);
      }

      const kind = (row.hasLeft && row.hasRight) ? 'match' : (row.hasLeft ? 'unmatched-left' : 'unmatched-right');

      return {
        id: `row-${index}`,
        kind,
        hasLeft: row.hasLeft,
        hasRight: row.hasRight,
        similarity: row.similarity,
        leftTopic: row.hasLeft ? row.leftData.topic : null,
        leftText: row.hasLeft ? row.leftData.text : null,
        leftSentenceIndex: row.hasLeft ? row.leftData.index : null,
        rightTopic: row.hasRight ? row.rightData.topic : null,
        rightText: row.hasRight ? row.rightData.text : null,
        rightSentenceIndex: row.hasRight ? row.rightData.index : null,
        nearestRight,
        nearestLeft,
      };
    });
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
