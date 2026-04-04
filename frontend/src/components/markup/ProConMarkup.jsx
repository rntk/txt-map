import React from "react";
import { getItemIndex, getTextByIndex } from "./markupUtils";
import HighlightedText from "../shared/HighlightedText";

/**
 * ProConMarkup - Displays pros and cons in a side-by-side layout
 * Features color-coded headers, icons, and accessibility attributes
 */
export default function ProConMarkup({ segment, sentences }) {
  const { pros = [], cons = [], pro_label, con_label } = segment.data || {};
  if (pros.length === 0 && cons.length === 0) return null;

  const renderItems = (items, type) =>
    items.map((item, i) => {
      const text =
        item.text || getTextByIndex(sentences, getItemIndex(item)) || "";
      if (!text) return null;
      return (
        <div key={i} className="markup-procon__item">
          <span className="markup-procon__item-icon" aria-hidden="true">
            {type === "pro" ? "✓" : "✕"}
          </span>
          <span>
            <HighlightedText text={text} />
          </span>
        </div>
      );
    });

  return (
    <div
      className="markup-segment markup-procon"
      role="region"
      aria-label="Pros and cons comparison"
    >
      <div className="markup-procon__col markup-procon__col--pros">
        <div className="markup-procon__label">
          <span className="markup-procon__icon" aria-hidden="true">
            ✓
          </span>
          {pro_label ? <HighlightedText text={pro_label} /> : "Pros"}
        </div>
        <div
          className="markup-procon__items"
          role="list"
          aria-label="Advantages"
        >
          {renderItems(pros, "pro")}
        </div>
      </div>
      <div className="markup-procon__col markup-procon__col--cons">
        <div className="markup-procon__label">
          <span className="markup-procon__icon" aria-hidden="true">
            ✕
          </span>
          {con_label ? <HighlightedText text={con_label} /> : "Cons"}
        </div>
        <div
          className="markup-procon__items"
          role="list"
          aria-label="Disadvantages"
        >
          {renderItems(cons, "con")}
        </div>
      </div>
    </div>
  );
}
