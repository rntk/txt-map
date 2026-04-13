import React, { useCallback, useEffect, useState } from "react";
import { formatDate } from "../utils/chartConstants";
import {
  appendPositiveIntegerParam,
  appendStringParam,
  buildQueryString,
  readErrorMessage,
} from "../utils/requestUtils";
import "../styles/App.css";

/**
 * @typedef {Object} TaskFilterState
 * @property {string} submissionId
 * @property {string} status
 * @property {string} limit
 */

/**
 * @typedef {Object} NewTaskState
 * @property {string} submissionId
 * @property {string} taskType
 * @property {string} priority
 */

/** @type {readonly string[]} */
const TASK_TYPES = [
  "split_topic_generation",
  "subtopics_generation",
  "summarization",
  "mindmap",
  "prefix_tree",
  "insights_generation",
  "markup_generation",
  "topic_marker_summary_generation",
  "clustering_generation",
  "topic_modeling_generation",
];

function TaskControlPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    submissionId: "",
    status: "",
    limit: "100",
  });
  const [newTask, setNewTask] = useState({
    submissionId: "",
    taskType: "split_topic_generation",
    priority: "",
  });
  const [actionMessage, setActionMessage] = useState("");

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
   * @param {string} field
   * @param {string} value
   * @returns {void}
   */
  const updateNewTask = useCallback(function updateNewTask(field, value) {
    setNewTask(function applyTaskUpdate(previousTask) {
      return { ...previousTask, [field]: value };
    });
  }, []);

  /**
   * @returns {string}
   */
  const buildQuery = useCallback(() => {
    return buildQueryString(function configureParams(params) {
      appendStringParam(params, "submission_id", filters.submissionId);
      appendStringParam(params, "status", filters.status);
      appendPositiveIntegerParam(params, "limit", filters.limit);
    });
  }, [filters.submissionId, filters.status, filters.limit]);

  /**
   * @returns {Promise<void>}
   */
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery();
      const response = await fetch(`/api/task-queue?${query}`);
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "Failed to load tasks"),
        );
      }
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  /**
   * @param {string | number} taskId
   * @returns {Promise<void>}
   */
  const handleDelete = async (taskId) => {
    setActionMessage("");
    try {
      const response = await fetch(`/api/task-queue/${taskId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Delete failed"));
      }
      setActionMessage("Task deleted.");
      fetchTasks();
    } catch (err) {
      setActionMessage(`Delete failed: ${err.message}`);
    }
  };

  /**
   * @param {string | number} taskId
   * @returns {Promise<void>}
   */
  const handleRepeat = async (taskId) => {
    setActionMessage("");
    try {
      const response = await fetch(`/api/task-queue/${taskId}/repeat`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Repeat failed"));
      }
      setActionMessage("Task re-queued.");
      fetchTasks();
    } catch (err) {
      setActionMessage(`Repeat failed: ${err.message}`);
    }
  };

  /**
   * @param {React.FormEvent<HTMLFormElement>} event
   * @returns {Promise<void>}
   */
  const handleAdd = async (event) => {
    event.preventDefault();
    setActionMessage("");

    if (!newTask.submissionId || !newTask.taskType) {
      setActionMessage("Submission ID and task type are required.");
      return;
    }

    const payload = {
      submission_id: newTask.submissionId,
      task_type: newTask.taskType,
    };

    if (newTask.priority) {
      payload.priority = Number(newTask.priority);
    }

    try {
      const response = await fetch("/api/task-queue/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Add failed"));
      }
      setActionMessage("Task added to queue.");
      updateNewTask("priority", "");
      fetchTasks();
    } catch (err) {
      setActionMessage(`Add failed: ${err.message}`);
    }
  };

  /**
   * @param {React.FormEvent<HTMLFormElement>} event
   * @returns {void}
   */
  const handleFilterSubmit = (event) => {
    event.preventDefault();
    fetchTasks();
  };

  return (
    <div className="page-stack task-page">
      <div className="task-page-header">
        <div>
          <h1>Task Control</h1>
          <p className="task-page-subtitle">
            Manage queue tasks: delete, repeat, or add new ones.
          </p>
        </div>
        <button type="button" className="task-refresh" onClick={fetchTasks}>
          Refresh
        </button>
      </div>

      <div className="task-panels">
        <form className="task-panel" onSubmit={handleFilterSubmit}>
          <h2>Filter Queue</h2>
          <label>
            Submission ID
            <input
              type="text"
              value={filters.submissionId}
              onChange={(event) =>
                updateFilters("submissionId", event.target.value)
              }
              placeholder="e.g. 8e0a..."
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => updateFilters("status", event.target.value)}
            >
              <option value="">Any</option>
              <option value="pending">pending</option>
              <option value="processing">processing</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label>
            Limit
            <input
              type="number"
              min="1"
              max="500"
              value={filters.limit}
              onChange={(event) => updateFilters("limit", event.target.value)}
            />
          </label>
          <button type="submit" className="task-primary">
            Apply Filters
          </button>
        </form>

        <form className="task-panel" onSubmit={handleAdd}>
          <h2>Add Task</h2>
          <label>
            Submission ID
            <input
              type="text"
              value={newTask.submissionId}
              onChange={(event) =>
                updateNewTask("submissionId", event.target.value)
              }
              placeholder="Paste submission ID"
            />
          </label>
          <label>
            Task Type
            <select
              value={newTask.taskType}
              onChange={(event) =>
                updateNewTask("taskType", event.target.value)
              }
            >
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority (optional)
            <input
              type="number"
              min="1"
              max="10"
              value={newTask.priority}
              onChange={(event) =>
                updateNewTask("priority", event.target.value)
              }
              placeholder="Default priority"
            />
          </label>
          <button type="submit" className="task-primary">
            Queue Task
          </button>
        </form>
      </div>

      {actionMessage && <div className="task-message">{actionMessage}</div>}

      {loading ? (
        <div className="task-state loading-text">Loading queue...</div>
      ) : error ? (
        <div className="task-state task-error">{error}</div>
      ) : (
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Submission</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan="7" className="task-empty">
                    No tasks match the filters.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="task-mono">
                      <span className="task-mono__value" title={task.id}>
                        {task.id?.slice(0, 8) ?? task.id}…
                      </span>
                    </td>
                    <td className="task-mono">
                      <a
                        href={`/page/text/${task.submission_id}`}
                        className="task-link"
                      >
                        {task.submission_id}
                      </a>
                    </td>
                    <td>{task.task_type}</td>
                    <td>
                      <span
                        className={`task-status task-status-${task.status}`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td>{task.priority}</td>
                    <td>{formatDate(task.created_at)}</td>
                    <td>
                      <div className="task-actions">
                        <button
                          type="button"
                          className="task-secondary"
                          onClick={() => handleRepeat(task.id)}
                        >
                          Repeat
                        </button>
                        <button
                          type="button"
                          className="task-danger"
                          onClick={() => handleDelete(task.id)}
                        >
                          Delete
                        </button>
                      </div>
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

export default TaskControlPage;
