import React from 'react';

export default function QuestionAnswerMarkup({ segment, sentences }) {
  const pairs = segment.data?.pairs || [];

  return (
    <div className="markup-segment markup-qa">
      {pairs.map((pair, i) => {
        const question = sentences && pair.question_sentence_index != null
          ? sentences[pair.question_sentence_index - 1]
          : '';
        const answers = (pair.answer_sentence_indices || []).map(idx =>
          sentences ? sentences[idx - 1] : ''
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
