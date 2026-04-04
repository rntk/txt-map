import React, { useEffect, useState } from "react";
import "./sharedControls.css";

/**
 * @typedef {Object} StatusIndicatorTaskInfo
 * @property {string} [status]
 * @property {string} [started_at]
 * @property {string} [completed_at]
 * @property {string} [error]
 */

/**
 * @typedef {Object.<string, StatusIndicatorTaskInfo>} StatusIndicatorTasks
 */

/**
 * @typedef {Object} StatusIndicatorProps
 * @property {StatusIndicatorTasks} tasks
 */

const KNOWN_STATUSES = new Set([
  "completed",
  "processing",
  "failed",
  "pending",
]);

/**
 * @param {string | undefined | null} status
 * @returns {'completed' | 'processing' | 'failed' | 'pending'}
 */
function normalizeStatus(status) {
  return KNOWN_STATUSES.has(status) ? status : "pending";
}

/**
 * @param {'completed' | 'processing' | 'failed' | 'pending'} status
 * @returns {string}
 */
function getStatusIcon(status) {
  switch (status) {
    case "completed":
      return "✓";
    case "processing":
      return "⟳";
    case "failed":
      return "✗";
    default:
      return "○";
  }
}

/**
 * @param {string | undefined} startedAt
 * @param {string | undefined} completedAt
 * @returns {string | null}
 */
function formatDuration(startedAt, completedAt) {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const ms = end - start;
  if (ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * @param {Object} props
 * @param {string} props.taskName
 * @param {StatusIndicatorTaskInfo} props.taskInfo
 * @param {() => void} props.onClose
 */
function TaskDetail({ taskName, taskInfo, onClose }) {
  const status = normalizeStatus(taskInfo.status);
  const duration = formatDuration(taskInfo.started_at, taskInfo.completed_at);
  return (
    <div className="shared-control-popover shared-control-popover--status shared-status-detail">
      <div className="shared-status-detail__title">
        {taskName.replace(/_/g, " ")}
      </div>
      <div className="shared-status-detail__row">
        <span
          className={`shared-status-pill__icon shared-status-pill__icon--${status}`}
        >
          {getStatusIcon(status)}
        </span>
        <span
          className={`shared-status-detail__status shared-status-detail__status--${status}`}
        >
          {status}
        </span>
      </div>
      {duration && (
        <div className="shared-status-detail__duration">
          Duration: {duration}
        </div>
      )}
      {taskInfo.error && (
        <div className="shared-status-detail__error">{taskInfo.error}</div>
      )}
      <button
        type="button"
        className="shared-control-button shared-control-button--compact"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}

/**
 * @param {StatusIndicatorProps} props
 */
function StatusIndicator({ tasks }) {
  const [openTask, setOpenTask] = useState(null);

  useEffect(() => {
    if (!openTask) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !target.closest(".shared-status-indicator__item")) {
        setOpenTask(null);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenTask(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openTask]);

  /**
   * @param {string} taskName
   */
  const handleToggle = (taskName) => {
    setOpenTask((prev) => (prev === taskName ? null : taskName));
  };

  return (
    <div className="shared-status-indicator">
      {Object.entries(tasks || {}).map(([taskName, taskInfo]) => {
        const status = normalizeStatus(taskInfo?.status);
        const isOpen = openTask === taskName;
        const label = taskName.replace(/_/g, " ");
        return (
          <div key={taskName} className="shared-status-indicator__item">
            <button
              type="button"
              onClick={() => handleToggle(taskName)}
              className={`shared-status-pill${isOpen ? " shared-status-pill--active" : ""} shared-status-pill--${status}`}
              aria-expanded={isOpen}
              aria-label={`${label} ${status}`}
            >
              <span
                className={`shared-status-pill__icon shared-status-pill__icon--${status}`}
              >
                {getStatusIcon(status)}
              </span>
              <span className="shared-status-pill__label">{label}</span>
              <span className="shared-status-pill__state">{status}</span>
            </button>
            {isOpen && (
              <TaskDetail
                taskName={taskName}
                taskInfo={taskInfo || {}}
                onClose={() => setOpenTask(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(StatusIndicator);
