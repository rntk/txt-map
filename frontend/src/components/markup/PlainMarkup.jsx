import React from "react";
import { getSegmentIndices, getTextByIndex } from "./markupUtils";
import HighlightedText from "../shared/HighlightedText";

export default function PlainMarkup({ segment, sentences }) {
  const indices = getSegmentIndices(segment);
  return (
    <div className="markup-segment">
      {indices.map((idx) => (
        <div key={idx} className="markup-plain__sentence">
          <span className="markup-plain__num">{idx}.</span>
          <span>
            <HighlightedText text={getTextByIndex(sentences, idx)} />
          </span>
        </div>
      ))}
    </div>
  );
}
