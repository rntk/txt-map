import React, { useState, useEffect, useRef, useMemo } from 'react';
import TreemapChart from './TreemapChart';
import ArticleStructureChart from './ArticleStructureChart';
import MindmapResults from './MindmapResults';
import TopicsTagCloud from './TopicsTagCloud';
import SectionRenderer from './storytelling/SectionRenderer';
import ReadingGuideLayout from './annotations/ReadingGuideLayout';
import { useSubmission } from '../hooks/useSubmission';
import { useTextPageData } from '../hooks/useTextPageData';
import { formatDate } from '../utils/chartConstants';
import '../styles/App.css';

// Static fallback slides (used when storytelling data is absent)
const SLIDES = [
  { key: 'overview', title: 'Article Overview' },
  { key: 'landscape', title: 'Topic Landscape' },
  { key: 'structure', title: 'Article Structure' },
  { key: 'mindmap', title: 'Mindmap' },
  { key: 'tags', title: 'Tags Cloud' },
];

function StaticCarousel({ submission, safeTopics, safeSentences, submissionId, articleSummaryText }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight') setCurrentSlide((s) => Math.min(s + 1, SLIDES.length - 1));
      if (e.key === 'ArrowLeft') setCurrentSlide((s) => Math.max(s - 1, 0));
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const noop = () => {};
  const results = submission?.results || {};

  return (
    <>
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
        <a className="overview-exit-link" href={`/page/text/${submissionId}`}>
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
              <TreemapChart topics={safeTopics} sentences={safeSentences} onShowInArticle={noop} />
            </div>
          </div>
        )}
        {currentSlide === 2 && (
          <div className="overview-slide__content overview-slide__content--chart">
            <h2 className="overview-slide__title">Article Structure</h2>
            <div className="overview-chart-container">
              <ArticleStructureChart topics={safeTopics} sentences={safeSentences} onShowInArticle={noop} />
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
              <TopicsTagCloud submissionId={submissionId} topics={safeTopics} sentences={safeSentences} />
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
    </>
  );
}

function StorytellingLayout({ submission, storytelling, safeTopics, safeSentences, submissionId }) {
  const sectionRefs = useRef([]);
  const results = submission?.results || {};

  const sections = useMemo(
    () => (Array.isArray(storytelling.sections) ? storytelling.sections : []),
    [storytelling.sections]
  );

  // TOC entries: chart sections with titles, plus named narrative sections
  const tocEntries = useMemo(() => {
    return sections
      .map((s, i) => {
        if (s.type === 'chart' && s.title) return { index: i, label: s.title };
        if (s.type === 'narrative' && s.style === 'intro') return { index: i, label: 'Introduction' };
        if (s.type === 'narrative' && s.style === 'conclusion') return { index: i, label: 'Conclusion' };
        if (s.type === 'key_findings') return { index: i, label: 'Key Findings' };
        return null;
      })
      .filter(Boolean);
  }, [sections]);

  const scrollToSection = (index) => {
    const el = sectionRefs.current[index];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRegenerate = async () => {
    try {
      await fetch(`/api/submission/${submissionId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: ['storytelling_generation'] }),
      });
      window.location.reload();
    } catch (e) {
      console.error('Regenerate failed', e);
    }
  };

  const dataCtx = {
    submissionId,
    topics: safeTopics,
    sentences: safeSentences,
    topicMindmaps: results.topic_mindmaps || {},
  };

  return (
    <div className="storytelling-layout">
      <div className="storytelling-header">
        <div className="storytelling-header__left">
          {storytelling.title && (
            <h1 className="storytelling-title">{storytelling.title}</h1>
          )}
        </div>
        <div className="storytelling-header__actions">
          <button className="storytelling-regen-btn" onClick={handleRegenerate} title="Regenerate story with AI">
            Regenerate Story
          </button>
          <a className="overview-exit-link" href={`/page/text/${submissionId}`}>
            Open Full View
          </a>
        </div>
      </div>

      <div className="storytelling-body">
        {tocEntries.length > 0 && (
          <nav className="storytelling-toc">
            {tocEntries.map((entry) => (
              <button
                key={entry.index}
                className="storytelling-toc__item"
                onClick={() => scrollToSection(entry.index)}
              >
                {entry.label}
              </button>
            ))}
          </nav>
        )}

        <div className="storytelling-sections">
          {sections.map((section, i) => (
            <div
              key={i}
              className="storytelling-section"
              ref={(el) => { sectionRefs.current[i] = el; }}
            >
              <SectionRenderer section={section} dataCtx={dataCtx} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OverviewPage() {
  const submissionId = window.location.pathname.split('/')[3];

  const { submission, loading, error, readTopics, toggleRead } = useSubmission(submissionId);
  const { allTopics: safeTopics, articleSummaryText, insights } = useTextPageData(
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

  // Fallback chain: annotations (new) → storytelling (legacy) → static carousel
  const annotations = results.annotations;
  const hasAnnotations =
    annotations &&
    typeof annotations === 'object' &&
    annotations.topic_annotations &&
    Object.keys(annotations.topic_annotations).length > 0;

  const storytelling = results.storytelling;
  const hasStorytelling = storytelling && Array.isArray(storytelling.sections) && storytelling.sections.length > 0;

  const storytellingTaskStatus = submission?.tasks?.storytelling_generation?.status;
  const isGenerating = storytellingTaskStatus === 'pending' || storytellingTaskStatus === 'processing';

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

  // New annotation-driven reading guide
  if (hasAnnotations) {
    return (
      <div className="overview-page">
        <ReadingGuideLayout
          submission={submission}
          annotations={annotations}
          insights={insights}
          safeTopics={safeTopics}
          safeSentences={safeSentences}
          submissionId={submissionId}
          readTopics={readTopics}
          toggleRead={toggleRead}
          topicSummaries={results.topic_summaries || {}}
        />
      </div>
    );
  }

  // Legacy LLM-generated storytelling layout
  if (hasStorytelling) {
    return (
      <div className="overview-page">
        <StorytellingLayout
          submission={submission}
          storytelling={storytelling}
          safeTopics={safeTopics}
          safeSentences={safeSentences}
          submissionId={submissionId}
        />
      </div>
    );
  }

  return (
    <div className="overview-page">
      {isGenerating && (
        <div className="storytelling-generating-banner">
          Annotating article...
        </div>
      )}
      <StaticCarousel
        submission={submission}
        safeTopics={safeTopics}
        safeSentences={safeSentences}
        submissionId={submissionId}
        articleSummaryText={articleSummaryText}
      />
    </div>
  );
}

export default OverviewPage;
