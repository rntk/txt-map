import { useState, useEffect, useCallback, useRef } from "react";

export function useSubmission(submissionId) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [readTopics, setReadTopics] = useState(new Set());
  const hasLoadedRef = useRef(false);
  const lastSyncedRef = useRef("");
  const pendingSaveRef = useRef(null);

  const fetchSubmission = useCallback(async () => {
    try {
      const response = await fetch(`/api/submission/${submissionId}`);

      if (!response.ok) {
        throw new Error("Submission not found");
      }

      const data = await response.json();
      setSubmission(data);
      if (!hasLoadedRef.current && data.read_topics?.length) {
        setReadTopics(new Set(data.read_topics));
        lastSyncedRef.current = JSON.stringify([...data.read_topics].sort());
      }
      hasLoadedRef.current = true;
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetchSubmission();

    const interval = setInterval(async () => {
      if (!submissionId) return;

      try {
        const response = await fetch(`/api/submission/${submissionId}/status`);
        if (response.ok) {
          const data = await response.json();

          setSubmission((prev) => {
            if (!prev) return null;

            // If any task that was not completed before is now completed, refetch full data
            const prevTasks = prev.status?.tasks || {};
            const newTasks = data.tasks || {};
            const anyNewCompleted = Object.keys(newTasks).some(
              (t) =>
                newTasks[t].status === "completed" &&
                prevTasks[t]?.status !== "completed",
            );

            if (anyNewCompleted) {
              // Trigger a full refetch in the next tick
              setTimeout(fetchSubmission, 0);
            }

            return {
              ...prev,
              status: { tasks: data.tasks, overall: data.overall_status },
            };
          });

          if (
            data.overall_status === "completed" ||
            data.overall_status === "failed"
          ) {
            clearInterval(interval);
            fetchSubmission();
          }
        }
      } catch (error) {
        console.error("Error polling status:", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchSubmission, submissionId]);

  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        const { id, topics } = pendingSaveRef.current;
        const blob = new Blob([JSON.stringify({ read_topics: topics })], {
          type: "application/json",
        });
        navigator.sendBeacon(`/api/submission/${id}/read-topics`, blob);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    const topicsArr = [...readTopics];
    const serialized = JSON.stringify([...topicsArr].sort());
    if (serialized === lastSyncedRef.current) return;

    pendingSaveRef.current = { id: submissionId, topics: topicsArr };

    const timer = setTimeout(() => {
      fetch(`/api/submission/${submissionId}/read-topics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read_topics: topicsArr }),
      })
        .then(() => {
          lastSyncedRef.current = serialized;
          pendingSaveRef.current = null;
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [readTopics, submissionId]);

  const toggleRead = (topic) => {
    setReadTopics((prev) => {
      const newSet = new Set(prev);
      const topicName = topic.name;
      if (newSet.has(topicName)) {
        newSet.delete(topicName);
      } else {
        newSet.add(topicName);
      }
      return newSet;
    });
  };

  const toggleReadAll = useCallback(
    (allTopicNames) => {
      const allRead =
        allTopicNames.length > 0 &&
        allTopicNames.every((n) => readTopics.has(n));
      if (allRead) {
        setReadTopics(new Set());
      } else {
        setReadTopics(new Set(allTopicNames));
      }
    },
    [readTopics],
  );

  return {
    submission,
    loading,
    error,
    fetchSubmission,
    readTopics,
    setReadTopics,
    toggleRead,
    toggleReadAll,
  };
}
