import React, { useState, useEffect, useMemo } from 'react';
import TreemapChart from './TreemapChart';
import ArticleStructureChart from './ArticleStructureChart';
import MindmapResults from './MindmapResults';
import TopicsTagCloud from './TopicsTagCloud';
import { useSubmission } from '../hooks/useSubmission';
import { useTextPageData } from '../hooks/useTextPageData';
import { formatDate } from '../utils/chartConstants';
import '../styles/App.css';

const SLIDES = [
  { key: 'overview', title: 'Article Overview' },
  { key: 'landscape', title: 'Topic Landscape' },
  { key: 'structure', title: 'Article Structure' },
  { key: 'mindmap', title: 'Mindmap' },
  { key: 'tags', title: 'Tags Cloud' },
];

function OverviewPage() {
  const submissionId = window.location.pathname.split('/')[3];
  const [currentSlide, setCurrentSlide] = useState(0);

  const { submission, loading, error } = useSubmission(submissionId);
  const { safeTopics, articleSummaryText } = useTextPageData(
    submission,
    [],
    null,
    new Set()
  );

  const results = useMemo(() => submission?.results || {}, [submission]);
  const safeSentences = useMemo(
    () => (Array.isArray(results.sentences) ? results.sentences : []),
    [results.sentences]
  );

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight') setCurrentSlide((s) => Math.min(s + 1, SLIDES.length - 1));
      if (e.key === 'ArrowLeft') setCurrentSlide((s) => Math.max(s - 1, 0));
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2 style={{ color: 'red' }}>Error: {error}</h2>
      </div>
    );
  }

  if (!submission) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>No submission data</h2>
      </div>
    );
  }

  const noop = () => {};

  return (
    <div className="overview-page">
      <div className="overview-header">
        <nav className="overview-toc">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.key}
              className={`overview-toc__item${i === currentSlide ? ' overview-toc__item--active' : ''}`}
              onClick={() => setCurrentSlide(i)}
            >
              {slide.title}
            </button>
          ))}
        </nav>
        <a
          className="overview-exit-link"
          href={`/page/text/${submissionId}`}
        >
          Open Full View
        </a>
      </div>

      <div className="overview-slide">
        {currentSlide === 0 && (
          <div className="overview-slide__content">
            <h2 className="overview-slide__title">Article Overview</h2>
            {articleSummaryText && (
              <p className="overview-summary-text">{articleSummaryText}</p>
            )}
            <div className="overview-stats">
              <div className="overview-stats__item">
                <span className="overview-stats__label">Sentences</span>
                <span className="overview-stats__value">{safeSentences.length.toLocaleString()}</span>
              </div>
              <div className="overview-stats__item">
                <span className="overview-stats__label">Topics</span>
                <span className="overview-stats__value">{safeTopics.length.toLocaleString()}</span>
              </div>
              <div className="overview-stats__item">
                <span className="overview-stats__label">Created</span>
                <span className="overview-stats__value">{formatDate(submission.created_at)}</span>
              </div>
              {submission.source_url && (
                <div className="overview-stats__item overview-stats__item--wide">
                  <span className="overview-stats__label">Source</span>
                  <span className="overview-stats__value overview-stats__value--url" title={submission.source_url}>
                    {submission.source_url}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {currentSlide === 1 && (
          <div className="overview-slide__content overview-slide__content--chart">
            <h2 className="overview-slide__title">Topic Landscape</h2>
            <div className="overview-chart-container">
              <TreemapChart
                topics={safeTopics}
                sentences={safeSentences}
                onShowInArticle={noop}
              />
            </div>
          </div>
        )}

        {currentSlide === 2 && (
          <div className="overview-slide__content overview-slide__content--chart">
            <h2 className="overview-slide__title">Article Structure</h2>
            <div className="overview-chart-container">
              <ArticleStructureChart
                topics={safeTopics}
                sentences={safeSentences}
                onShowInArticle={noop}
              />
            </div>
          </div>
        )}

        {currentSlide === 3 && (
          <div className="overview-slide__content overview-slide__content--chart">
            <h2 className="overview-slide__title">Mindmap</h2>
            <div className="overview-chart-container">
              <MindmapResults
                mindmapData={{
                  topic_mindmaps: results.topic_mindmaps || {},
                  sentences: safeSentences,
                }}
              />
            </div>
          </div>
        )}

        {currentSlide === 4 && (
          <div className="overview-slide__content overview-slide__content--chart">
            <h2 className="overview-slide__title">Tags Cloud</h2>
            <div className="overview-chart-container">
              <TopicsTagCloud
                submissionId={submissionId}
                topics={safeTopics}
                sentences={safeSentences}
              />
            </div>
          </div>
        )}
      </div>

      <div className="overview-nav">
        <button
          className="overview-nav__button"
          onClick={() => setCurrentSlide((s) => Math.max(s - 1, 0))}
          disabled={currentSlide === 0}
        >
          Back
        </button>
        <span className="overview-nav__progress">
          {currentSlide + 1} of {SLIDES.length}
        </span>
        <button
          className="overview-nav__button overview-nav__button--next"
          onClick={() => setCurrentSlide((s) => Math.min(s + 1, SLIDES.length - 1))}
          disabled={currentSlide === SLIDES.length - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default OverviewPage;
