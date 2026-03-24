import React from 'react';
import { getTextByIndex } from './markupUtils';

export default function QuestionAnswerMarkup({ segment, sentences }) {
  const pairs = segment.data?.pairs || [];

  return (
    <div className="markup-segment markup-qa">
      {pairs.map((pair, i) => {
        const questionIndex = pair.question_position_index ?? pair.question_sentence_index;
        const question = getTextByIndex(sentences, questionIndex);
        const answers = (pair.answer_position_indices || pair.answer_sentence_indices || []).map(idx =>
          getTextByIndex(sentences, idx)
        );
        return (
          <div key={i} className="markup-qa__pair">
            <div className="markup-qa__question">{question}</div>
            <div className="markup-qa__answers">
              {answers.map((ans, j) => (
                <div key={j} className="markup-qa__answer">{ans}</div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
