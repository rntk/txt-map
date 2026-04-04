import React, { useState, useEffect, useRef } from "react";
import ReadProgress from "./ReadProgress";
import { calculateReadPercentage } from "../utils/readProgress";

const PLACEHOLDER_SIZE = 80;

function supportsIntersectionObserver() {
  return typeof IntersectionObserver !== "undefined";
}

export default function ArticleReadProgress({ submissionId }) {
  const [progress, setProgress] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!supportsIntersectionObserver()) {
      setIsVisible(true);
      return undefined;
    }

    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const observer = new IntersectionObserver(function handleIntersection([
      entry,
    ]) {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(element);
      }
    });

    observer.observe(element);

    return function cleanup() {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }

    let isActive = true;

    async function loadProgress() {
      try {
        const response = await fetch(
          `/api/submission/${submissionId}/read-progress`,
        );
        const data = await response.json();

        if (isActive) {
          setProgress(data);
        }
      } catch {}
    }

    loadProgress();

    return function cleanup() {
      isActive = false;
    };
  }, [isVisible, submissionId]);

  if (!progress) {
    return <div ref={ref} style={{ width: PLACEHOLDER_SIZE, height: 40 }} />;
  }

  const percentage = calculateReadPercentage(progress);

  return (
    <div ref={ref}>
      <ReadProgress
        percentage={percentage}
        size={PLACEHOLDER_SIZE}
        label="Article progress"
      />
    </div>
  );
}
