import React, { useState, useEffect } from 'react';
import ReadProgress from './ReadProgress';
import { calculateReadPercentage } from '../utils/readProgress';

export default function GlobalReadProgress({ size = 150 }) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let isActive = true;

    async function loadProgress() {
      try {
        const response = await fetch('/api/submissions/read-progress');
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
  }, []);

  if (!progress) {
    return <div style={{ width: size, height: size * 0.6 }} />;
  }

  const percentage = calculateReadPercentage(progress);
  return <ReadProgress percentage={percentage} label="Read sentences" size={size} />;
}
