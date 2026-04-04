import React, { useState, useCallback } from "react";
import DropdownMenu from "./shared/DropdownMenu";
import StatusIndicator from "./shared/StatusIndicator";
import RefreshButton from "./shared/RefreshButton";
import "./shared/sharedControls.css";

/**
 * @typedef {Object} TextPageToolbarTaskInfo
 * @property {string} [status]
 * @property {string} [started_at]
 * @property {string} [completed_at]
 * @property {string} [error]
 */

/**
 * @typedef {Object.<string, TextPageToolbarTaskInfo>} TextPageToolbarTasks
 */

/**
 * @typedef {Object} TextPageToolbarStatus
 * @property {string} overall
 * @property {TextPageToolbarTasks} tasks
 */

/**
 * @typedef {Object} TextPageToolbarProps
 * @property {string} submissionId
 * @property {TextPageToolbarStatus} status
 * @property {() => void} onRefresh
 */

const RECALCULATE_ACTIONS = [
  {
    label: "All",
    tasks: ["all"],
    message: "Recalculation queued for all tasks.",
  },
  {
    label: "Topics",
    tasks: [
      "split_topic_generation",
      "subtopics_generation",
      "summarization",
      "mindmap",
      "insights_generation",
    ],
    message: "Topic-related tasks queued.",
  },
  {
    label: "Summary",
    tasks: ["summarization"],
    message: "Summarization queued.",
  },
  { label: "Mindmap", tasks: ["mindmap"], message: "Mindmap queued." },
  {
    label: "Prefix Tree",
    tasks: ["prefix_tree"],
    message: "Prefix tree queued.",
  },
  {
    label: "Insights",
    tasks: ["insights_generation"],
    message: "Insights queued.",
  },
  {
    label: "Markup",
    tasks: ["markup_generation"],
    message: "Markup generation queued.",
  },
  {
    label: "Clustering",
    tasks: ["clustering_generation"],
    message: "Clustering queued.",
  },
  {
    label: "Topic Modeling",
    tasks: ["topic_modeling_generation"],
    message: "Topic modeling queued.",
  },
];

/**
 * @param {TextPageToolbarProps} props
 */
function TextPageToolbar({ submissionId, status, onRefresh }) {
  const [actionMessage, setActionMessage] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const runRefresh = useCallback(
    async (tasks, successMessage) => {
      setActionMessage("");
      setActionLoading(true);
      try {
        const response = await fetch(
          `/api/submission/${submissionId}/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tasks }),
          },
        );

        if (!response.ok) {
          throw new Error(await response.text());
        }

        setActionMessage(successMessage);
        onRefresh();
      } catch (err) {
        setActionMessage(`Action failed: ${err.message}`);
      } finally {
        setActionLoading(false);
      }
    },
    [submissionId, onRefresh],
  );

  const handleDelete = useCallback(async () => {
    if (
      !window.confirm(
        "Delete this submission and all its queued tasks? This cannot be undone.",
      )
    ) {
      return;
    }
    setActionMessage("");
    setActionLoading(true);
    try {
      const response = await fetch(`/api/submission/${submissionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setActionMessage("Submission deleted.");
      window.location.href = "/page/topics";
    } catch (err) {
      setActionMessage(`Delete failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }, [submissionId]);

  return (
    <>
      <DropdownMenu buttonContent={<span>Status</span>}>
        <h3 className="shared-control-popover__title">Task Status</h3>
        <StatusIndicator tasks={status.tasks} />
      </DropdownMenu>

      <DropdownMenu
        buttonContent={
          <>
            <span className="shared-control-trigger__icon">☰</span> Menu
          </>
        }
      >
        <h3 className="shared-control-popover__title">Recalculate</h3>
        <div className="shared-control-stack">
          {RECALCULATE_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="shared-control-button shared-control-button--toolbar"
              onClick={() => runRefresh(action.tasks, action.message)}
              disabled={actionLoading}
            >
              {action.label}
            </button>
          ))}
        </div>

        <hr className="shared-control-divider" />

        <div className="shared-control-stack shared-control-stack--stretch">
          <RefreshButton
            submissionId={submissionId}
            onRefresh={onRefresh}
            compact={false}
          />
          <button
            type="button"
            className="shared-control-button shared-control-button--toolbar shared-control-button--toolbar-centered shared-control-button--danger"
            onClick={handleDelete}
            disabled={actionLoading}
          >
            Delete
          </button>
        </div>
        {actionMessage && (
          <div className="shared-control-message">{actionMessage}</div>
        )}
      </DropdownMenu>
    </>
  );
}

export default TextPageToolbar;
