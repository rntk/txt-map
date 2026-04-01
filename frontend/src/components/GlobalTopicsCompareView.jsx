import React, { useEffect, useRef } from 'react';
import '../styles/GlobalTopics.css';

/**
 * @typedef {Object} GlobalTopicsCompareTopic
 * @property {string} name
 * @property {number[]=} sentences
 */

/**
 * @typedef {Object} GlobalTopicsCompareGroup
 * @property {string} submission_id
 * @property {string=} source_url
 * @property {string} topic_name
 * @property {string[]} sentences
 * @property {string[]=} all_sentences
 * @property {GlobalTopicsCompareTopic[]=} topics
 * @property {number[]=} indices
 */

/**
 * @param {{ groups: GlobalTopicsCompareGroup[], groupRefs: React.MutableRefObject<Record<string, HTMLElement | null>> }} props
 */
function GlobalTopicsCompareView({ groups, groupRefs }) {
  const safeGroups = Array.isArray(groups) ? groups : [];

  if (safeGroups.length === 0) {
    return null;
  }

  return (
    <div className="global-topics-compare">
      {safeGroups.map((group, groupIdx) => {
        const {
          submission_id,
          source_url,
          topic_name,
          sentences,
          all_sentences,
          topics,
          indices,
        } = group;

        if (!all_sentences || !indices || indices.length === 0) {
          const safeSentences = Array.isArray(sentences) ? sentences : [];
          return (
            <div
              key={`${submission_id}-${topic_name}-${groupIdx}`}
              className="global-topics-surface global-topics-compare__column"
            >
              <div className="global-topics-compare__column-header">
                <div className="global-topics-compare__column-meta">
                  {source_url ? (
                    <a href={source_url} target="_blank" rel="noopener noreferrer" title={source_url}>
                      {formatSourceLabel(source_url, submission_id)}
                    </a>
                  ) : (
                    submission_id.substring(0, 8)
                  )}
                </div>
                <div className="global-topics-compare__column-title">{topic_name}</div>
              </div>
              <div className="global-topics-compare__context">
                <p className="global-topics-compare__context-empty">Context not available. Sentences:</p>
                <ul className="global-topics-compare__context-inner">
                  {safeSentences.map((s, i) => (
                    <li key={i} className="global-topics-compare__match-sentence">{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        }

        const matchIndices = indices.map((i) => i - 1).sort((a, b) => a - b);
        const firstMatch = matchIndices[0];
        const lastMatch = matchIndices[matchIndices.length - 1];

        const sentenceToTopics = buildSentenceTopicMap(topics);

        const topContext = all_sentences.slice(0, firstMatch).map((text, i) => ({
          text,
          index: i,
          topics: sentenceToTopics[i] || [],
        }));

        const middleContent = all_sentences.slice(firstMatch, lastMatch + 1).map((text, idx) => {
          const actualIndex = firstMatch + idx;
          const isMatch = matchIndices.includes(actualIndex);
          return {
            text,
            index: actualIndex,
            isMatch,
            topics: sentenceToTopics[actualIndex] || [],
          };
        });

        const bottomContext = all_sentences.slice(lastMatch + 1).map((text, idx) => {
          const actualIndex = lastMatch + 1 + idx;
          return {
            text,
            index: actualIndex,
            topics: sentenceToTopics[actualIndex] || [],
          };
        });

        return (
          <CompareColumn
            key={`${submission_id}-${topic_name}-${groupIdx}`}
            sourceUrl={source_url}
            submissionId={submission_id}
            topicName={topic_name}
            topContext={topContext}
            middleContent={middleContent}
            bottomContext={bottomContext}
            groupRef={(el) => {
              if (groupRefs?.current && !groupRefs.current[topic_name]) {
                groupRefs.current[topic_name] = el;
              }
            }}
          />
        );
      })}
    </div>
  );
}

function buildSentenceTopicMap(groups) {
  const sentenceToTopics = {};

  (Array.isArray(groups) ? groups : []).forEach((topicGroup) => {
    const topicSentences = topicGroup?.sentences || [];
    topicSentences.forEach((idx) => {
      const sentenceIndex = Number(idx) - 1;
      if (!Number.isInteger(sentenceIndex) || sentenceIndex < 0) {
        return;
      }

      if (!sentenceToTopics[sentenceIndex]) {
        sentenceToTopics[sentenceIndex] = [];
      }
      sentenceToTopics[sentenceIndex].push(topicGroup.name);
    });
  });

  return sentenceToTopics;
}

function formatSourceLabel(sourceUrl, submissionId) {
  return sourceUrl.replace(/^https?:\/\//, '').substring(0, 50) || submissionId.substring(0, 8);
}

function CompareColumn({
  sourceUrl,
  submissionId,
  topicName,
  topContext,
  middleContent,
  bottomContext,
  groupRef,
}) {
  const topRef = useRef(null);

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollTop = topRef.current.scrollHeight;
    }
  }, []);

  return (
    <div
      ref={groupRef}
      className="global-topics-surface global-topics-compare__column"
    >
      <div className="global-topics-compare__column-header">
        <div className="global-topics-compare__column-meta">
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" title={sourceUrl}>
              {formatSourceLabel(sourceUrl, submissionId)}
            </a>
          ) : (
            submissionId.substring(0, 8)
          )}
        </div>
        <div className="global-topics-compare__column-title">
          {topicName}
        </div>
      </div>

      <div ref={topRef} className="global-topics-compare__context">
        {topContext.length > 0 ? (
          <div className="global-topics-compare__context-inner">
            {topContext.map((item) => (
              <ContextSentence key={item.index} item={item} />
            ))}
          </div>
        ) : (
          <div className="global-topics-compare__context-empty">No prior context</div>
        )}
      </div>

      <div className="global-topics-compare__match-strip">
        {middleContent.map((item) => (
          <div
            key={item.index}
            className={`global-topics-compare__match-sentence${item.isMatch ? ' global-topics-compare__match-sentence--highlighted' : ''}`}
          >
            {item.text}
          </div>
        ))}
      </div>

      <div className="global-topics-compare__context">
        {bottomContext.length > 0 ? (
          <div className="global-topics-compare__context-inner">
            {bottomContext.map((item) => <ContextSentence key={item.index} item={item} />)}
          </div>
        ) : (
          <div className="global-topics-compare__context-empty">No subsequent context</div>
        )}
      </div>
    </div>
  );
}

function ContextSentence({ item }) {
  return (
    <div className="global-topics-source-card__context-item">
      {item.topics.length > 0 && (
        <div className="global-topics-source-card__topic-list">
          {item.topics.map((t) => (
            <span
              key={t}
              className="global-topics-topic-chip global-topics-compare__topic-chip"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div>{item.text}</div>
    </div>
  );
}

export default GlobalTopicsCompareView;
