import { useState, useEffect, useCallback, useRef } from "react";
import {
  setTopicNamesReadState,
  toReadTopicsSet,
} from "../utils/topicReadUtils";
import { getTopicSelectionCanonicalTopicNames } from "../utils/topicModalSelection";

function getSelectionTopicNames(selection) {
  const canonicalTopicNames = getTopicSelectionCanonicalTopicNames(selection);
  if (canonicalTopicNames.length > 0) {
    return canonicalTopicNames;
  }
  return [];
}

function useReadTopics(submissionId) {
  const [readTopics, setReadTopics] = useState(new Set());
  const hasLoadedRef = useRef(false);
  const lastSyncedRef = useRef("");
  const pendingSaveRef = useRef(null);

  const persistReadTopics = useCallback(
    async (topicsArr, serialized) => {
      const response = await fetch(
        `/api/submission/${submissionId}/read-topics`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read_topics: topicsArr }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to sync read topics");
      }

      lastSyncedRef.current = serialized;
      pendingSaveRef.current = null;
    },
    [submissionId],
  );

  const syncFromSubmission = useCallback((data) => {
    if (!hasLoadedRef.current && data.read_topics?.length) {
      setReadTopics(new Set(data.read_topics));
      lastSyncedRef.current = JSON.stringify([...data.read_topics].sort());
    }
    hasLoadedRef.current = true;
  }, []);

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
    const topicsArr = [...toReadTopicsSet(readTopics)];
    const serialized = JSON.stringify([...topicsArr].sort());
    if (serialized === lastSyncedRef.current) return;

    pendingSaveRef.current = { id: submissionId, topics: topicsArr };

    const timer = setTimeout(() => {
      persistReadTopics(topicsArr, serialized).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [persistReadTopics, readTopics, submissionId]);

  const setSelectionReadState = useCallback((selection, shouldRead) => {
    const topicNames = getSelectionTopicNames(selection);
    if (topicNames.length === 0) {
      return;
    }

    setReadTopics((prev) => {
      return setTopicNamesReadState(prev, topicNames, shouldRead);
    });
  }, []);

  const toggleRead = useCallback((selection) => {
    const topicNames = getSelectionTopicNames(selection);
    if (topicNames.length === 0) {
      return;
    }

    setReadTopics((prev) => {
      const readTopicsSet = toReadTopicsSet(prev);
      const shouldRead = topicNames.some(
        (topicName) => !readTopicsSet.has(topicName),
      );
      return setTopicNamesReadState(readTopicsSet, topicNames, shouldRead);
    });
  }, []);

  const toggleReadAll = useCallback(
    (allTopicNames) => {
      const safeReadTopics = toReadTopicsSet(readTopics);
      const allRead =
        allTopicNames.length > 0 &&
        allTopicNames.every((n) => safeReadTopics.has(n));
      if (allRead) {
        setReadTopics(new Set());
      } else {
        setReadTopics(new Set(allTopicNames));
      }
    },
    [readTopics],
  );

  return {
    readTopics,
    setReadTopics,
    toggleRead,
    setSelectionReadState,
    toggleReadAll,
    syncFromSubmission,
  };
}

export function useSubmission(submissionId) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { readTopics, setReadTopics, toggleRead, setSelectionReadState, toggleReadAll, syncFromSubmission } =
    useReadTopics(submissionId);

  const fetchSubmission = useCallback(async () => {
    try {
      const response = await fetch(`/api/submission/${submissionId}`);

      if (!response.ok) {
        throw new Error("Submission not found");
      }

      const data = await response.json();
      setSubmission(data);
      syncFromSubmission(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [submissionId, syncFromSubmission]);

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

  const getSimilarWords = useCallback(
    async (word) => {
      const response = await fetch(
        `/api/submission/${submissionId}/similar-words?word=${encodeURIComponent(word)}`,
      );
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.similar_words || [];
    },
    [submissionId],
  );

  return {
    submission,
    loading,
    error,
    fetchSubmission,
    readTopics,
    setReadTopics,
    toggleRead,
    setSelectionReadState,
    toggleReadAll,
    getSimilarWords,
  };
}
