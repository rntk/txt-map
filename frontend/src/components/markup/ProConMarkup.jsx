import React from 'react';
import { getItemIndex, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

export default function ProConMarkup({ segment, sentences }) {
  const { pros = [], cons = [], pro_label, con_label } = segment.data || {};
  if (pros.length === 0 && cons.length === 0) return null;

  const renderItems = (items) =>
    items.map((item, i) => {
      const text = item.text || getTextByIndex(sentences, getItemIndex(item)) || '';
      if (!text) return null;
      return (
        <div key={i} className="markup-procon__item">
          <span className="markup-procon__icon" aria-hidden="true">✓</span>
          <span><HighlightedText text={text} /></span>
        </div>
      );
    });

  const renderConItems = (items) =>
    items.map((item, i) => {
      const text = item.text || getTextByIndex(sentences, getItemIndex(item)) || '';
      if (!text) return null;
      return (
        <div key={i} className="markup-procon__item">
          <span className="markup-procon__icon" aria-hidden="true">✕</span>
          <span><HighlightedText text={text} /></span>
        </div>
      );
    });

  return (
    <div className="markup-segment markup-procon">
      <div className="markup-procon__col markup-procon__col--pros">
        <div className="markup-procon__label">
          {pro_label ? <HighlightedText text={pro_label} /> : 'Pros'}
        </div>
        <div className="markup-procon__items">{renderItems(pros)}</div>
      </div>
      <div className="markup-procon__col markup-procon__col--cons">
        <div className="markup-procon__label">
          {con_label ? <HighlightedText text={con_label} /> : 'Cons'}
        </div>
        <div className="markup-procon__items">{renderConItems(cons)}</div>
      </div>
    </div>
  );
}
