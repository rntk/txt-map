import React, { useEffect, useRef } from 'react';

function GlobalTopicsCompareView({ groups, groupRefs }) {
  if (!groups || groups.length === 0) {
    return null;
  }

  return (
    <div
      className="compare-view-container"
      style={{
        display: 'flex',
        overflowX: 'auto',
        gap: '20px',
        padding: '20px',
        height: 'calc(100vh - 200px)', // adjust based on available space
        backgroundColor: '#fafafa',
        alignItems: 'stretch',
        fontFamily: 'Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {groups.map((group, groupIdx) => {
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
          // Fallback if context data is missing
          return (
            <div
              key={`${submission_id}-${topic_name}-${groupIdx}`}
              style={{
                width: '550px',
                flexShrink: 0,
                backgroundColor: 'white',
                border: '1px solid #ccc',
                padding: '15px',
              }}
            >
              <h4 style={{ fontSize: '18px', marginBottom: '10px' }}>{source_url || submission_id}</h4>
              <p style={{ fontSize: '15px' }}>Context not available. Sentences:</p>
              <ul style={{ fontSize: '15px', lineHeight: '1.6' }}>
                {sentences.map((s, i) => (
                  <li key={i} style={{ marginBottom: '8px' }}>{s}</li>
                ))}
              </ul>
            </div>
          );
        }

        // 1-based indices to 0-based index
        const matchIndices = indices.map((i) => i - 1).sort((a, b) => a - b);
        const firstMatch = matchIndices[0];
        const lastMatch = matchIndices[matchIndices.length - 1];

        // Create mapping from sentence index to topic names for context labels
        const sentenceToTopics = {};
        if (topics) {
          topics.forEach((t) => {
            const tIndices = t.sentences || [];
            tIndices.forEach((idx) => {
              const i = idx - 1;
              if (!sentenceToTopics[i]) sentenceToTopics[i] = [];
              sentenceToTopics[i].push(t.name);
            });
          });
        }

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
            groupKey={`${topic_name}-${submission_id}`}
            sourceUrl={source_url}
            submissionId={submission_id}
            topicName={topic_name}
            topContext={topContext}
            middleContent={middleContent}
            bottomContext={bottomContext}
            groupRef={(el) => {
              if (groupRefs && groupRefs.current && !groupRefs.current[topic_name]) {
                groupRefs.current[topic_name] = el;
              }
            }}
          />
        );
      })}
    </div>
  );
}

function CompareColumn({
  sourceUrl,
  submissionId,
  topicName,
  topContext,
  middleContent,
  bottomContext,
  groupRef,
  groupKey,
}) {
  const topRef = useRef(null);

  useEffect(() => {
    // Auto-scroll the top context to the bottom so adjacent sentences are visible
    if (topRef.current) {
      topRef.current.scrollTop = topRef.current.scrollHeight;
    }
  }, []);

  return (
    <div
      ref={groupRef}
      className="compare-column"
      style={{
        width: '550px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '15px',
          borderBottom: '1px solid #eee',
          backgroundColor: '#f9f9f9',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px' }}>
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
              {sourceUrl.replace(/^https?:\/\//, '').substring(0, 50)}...
            </a>
          ) : (
            submissionId.substring(0, 8)
          )}
        </div>
        <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#2c3e50' }}>
          {topicName}
        </div>
      </div>

      {/* Top Context */}
      <div
        ref={topRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '15px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start', // allow it to scroll properly
        }}
      >
        {topContext.length > 0 ? (
          <div style={{ marginTop: 'auto' }}>
            {topContext.map((item) => (
              <ContextSentence key={item.index} item={item} />
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 'auto', color: '#aaa', fontSize: '14px', fontStyle: 'italic', textAlign: 'center' }}>
            No prior context
          </div>
        )}
      </div>

      {/* Middle Content (Matched sentences) */}
      <div
        style={{
          flex: '0 0 auto',
          padding: '20px 15px',
          borderTop: '3px solid #3498db',
          borderBottom: '3px solid #3498db',
          backgroundColor: '#eaf4fc',
          maxHeight: '40vh',
          overflowY: 'auto',
        }}
      >
        {middleContent.map((item) => (
          <div
            key={item.index}
            style={{
              marginBottom: '12px',
              fontSize: '16px',
              lineHeight: '1.6',
              color: item.isMatch ? '#000' : '#444',
              fontWeight: item.isMatch ? '500' : 'normal',
              opacity: item.isMatch ? 1 : 0.85,
            }}
          >
            {item.text}
          </div>
        ))}
      </div>

      {/* Bottom Context */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '15px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
        }}
      >
        {bottomContext.length > 0 ? (
          bottomContext.map((item) => <ContextSentence key={item.index} item={item} />)
        ) : (
          <div style={{ color: '#aaa', fontSize: '14px', fontStyle: 'italic', textAlign: 'center' }}>
            No subsequent context
          </div>
        )}
      </div>
    </div>
  );
}

function ContextSentence({ item }) {
  return (
    <div style={{ marginBottom: '15px', fontSize: '15px', lineHeight: '1.5', color: '#555' }}>
      {item.topics.length > 0 && (
        <div style={{ marginBottom: '4px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {item.topics.map((t) => (
            <span
              key={t}
              style={{
                fontSize: '11px',
                backgroundColor: '#f0f0f0',
                padding: '3px 6px',
                borderRadius: '4px',
                color: '#555',
                fontWeight: '500',
              }}
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