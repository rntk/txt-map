import React, { useState, useEffect, useRef } from 'react';
import ReadProgress from './ReadProgress';

export default function ArticleReadProgress({ submissionId }) {
  const [progress, setProgress] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(el);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    
    let isMounted = true;
    fetch(`/api/submission/${submissionId}/read-progress`)
      .then(res => res.json())
      .then(data => {
        if (isMounted) setProgress(data);
      })
      .catch(e => console.error(e));
      
    return () => { isMounted = false; };
  }, [isVisible, submissionId]);

  if (!progress) {
    return <div ref={ref} style={{ width: 80, height: 40 }} />; // placeholder
  }

  const percent = progress.total_count > 0 ? (progress.read_count / progress.total_count) * 100 : 0;
  return (
    <div ref={ref}>
      <ReadProgress percentage={percent} size={80} />
    </div>
  );
}
