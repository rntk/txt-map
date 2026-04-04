import React from "react";
import { getItemIndex, getTextByIndex } from "./markupUtils";
import HighlightedText from "../shared/HighlightedText";

export default function ListMarkup({ segment, sentences }) {
  const items = segment.data?.items || [];
  const ordered = segment.data?.ordered === true;
  const Tag = ordered ? "ol" : "ul";

  return (
    <div className="markup-segment">
      <Tag className={`markup-list${ordered ? " markup-list--ordered" : ""}`}>
        {items.map((item, i) => {
          const itemIndex = getItemIndex(item);
          const text = item.text || getTextByIndex(sentences, itemIndex) || "";
          return (
            <li key={i} className="markup-list__item">
              {ordered ? (
                <span className="markup-list__ordinal">{i + 1}.</span>
              ) : (
                <>
                  <span className="markup-list__num">
                    {itemIndex != null ? `${itemIndex}.` : ""}
                  </span>
                  <span className="markup-list__bullet">•</span>
                </>
              )}
              <span>
                <HighlightedText text={text} />
              </span>
            </li>
          );
        })}
      </Tag>
    </div>
  );
}
