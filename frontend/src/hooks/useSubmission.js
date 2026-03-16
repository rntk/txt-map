import { useState, useEffect, useCallback, useRef } from 'react';

export function useSubmission(submissionId) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [readTopics, setReadTopics] = useState(new Set());
  const hasLoadedRef = useRef(false);
  const lastSyncedRef = useRef('');
  const pendingSaveRef = useRef(null);

  const fetchSubmission = useCallback(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/submission/${submissionId}`);

      if (!response.ok) {
        throw new Error('Submission not found');
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
        const response = await fetch(`http://127.0.0.1:8000/api/submission/${submissionId}/status`);
        if (response.ok) {
          const data = await response.json();
          setSubmission(prev => prev ? { ...prev, status: { tasks: data.tasks, overall: data.overall_status } } : null);

          if (data.overall_status === 'completed' || data.overall_status === 'failed') {
            clearInterval(interval);
            fetchSubmission();
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchSubmission, submissionId]);

  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        const { id, topics } = pendingSaveRef.current;
        const blob = new Blob([JSON.stringify({ read_topics: topics })], { type: 'application/json' });
        navigator.sendBeacon(`http://127.0.0.1:8000/api/submission/${id}/read-topics`, blob);
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
      fetch(`http://127.0.0.1:8000/api/submission/${submissionId}/read-topics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    setReadTopics(prev => {
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

  const toggleReadAll = useCallback((allTopicNames) => {
    const allRead = allTopicNames.length > 0 && allTopicNames.every(n => readTopics.has(n));
    if (allRead) {
      setReadTopics(new Set());
    } else {
      setReadTopics(new Set(allTopicNames));
    }
  }, [readTopics]);

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
