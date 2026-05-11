import React from "react";

/**
 * @param {{
 *   summaryViewCards: Array<{
 *     path: string,
 *     name: string,
 *     text: string,
 *     bullets: string[],
 *     sourceSentences: number[],
 *     startSentence: number,
 *   }>,
 *   summaryViewActivePath: string | null,
 *   summaryCardRefs: React.MutableRefObject<{[key: string]: HTMLElement | null}>,
 *   setHoveredTopicKey: React.Dispatch<React.SetStateAction<string | null>>,
 *   articleTextRef: React.RefObject<HTMLDivElement | null>,
 * }} props
 */
export default function CanvasSummaryView({
  summaryViewCards,
  summaryViewActivePath,
  summaryCardRefs,
  setHoveredTopicKey,
  articleTextRef,
}) {
  if (summaryViewCards.length === 0) {
    return (
      <div className="canvas-summary-view" ref={articleTextRef}>
        <p className="canvas-summary-view__empty">
          No summaries available at this level.
        </p>
      </div>
    );
  }

  return (
    <div className="canvas-summary-view" ref={articleTextRef}>
      <div className="canvas-summary-view__cards">
        {summaryViewCards.map((card) => {
          const isActive = summaryViewActivePath === card.path;
          return (
            <article
              key={card.path}
              ref={(el) => {
                if (el) summaryCardRefs.current[card.path] = el;
                else delete summaryCardRefs.current[card.path];
              }}
              className={`canvas-summary-view__card${isActive ? " is-active" : ""}`}
              onMouseEnter={() => setHoveredTopicKey(card.path)}
              onMouseLeave={() =>
                setHoveredTopicKey((current) =>
                  current === card.path ? null : current,
                )
              }
              title={card.path}
            >
              <header className="canvas-summary-view__card-header">
                <span className="canvas-summary-view__card-path">
                  {card.path}
                </span>
                {card.sourceSentences.length > 0 && (
                  <span className="canvas-summary-view__card-meta">
                    sentences {card.startSentence} (
                    {card.sourceSentences.length})
                  </span>
                )}
              </header>
              {card.text && (
                <p className="canvas-summary-view__card-text">{card.text}</p>
              )}
              {card.bullets.length > 0 && (
                <ul className="canvas-summary-view__card-bullets">
                  {card.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
