import React, { useState, useEffect } from 'react';
import ReadProgress from './ReadProgress';

export default function GlobalReadProgress({ size = 150 }) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    fetch('/api/submissions/read-progress')
      .then(res => res.json())
      .then(data => setProgress(data))
      .catch(e => console.error(e));
  }, []);

  if (!progress) {
    return <div style={{ width: size, height: size * 0.6 }} />;
  }

  const percent = progress.total_count > 0 ? (progress.read_count / progress.total_count) * 100 : 0;
  return <ReadProgress percentage={percent} label="Read sentences" size={size} />;
}
