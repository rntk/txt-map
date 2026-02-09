import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import TextDisplay from './TextDisplay';

function render(ui) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

describe('TextDisplay', () => {
  it('renders sanitized raw HTML and keeps highlight/read state classes', () => {
    const sentences = ['First sentence.', 'Second sentence.', 'Third sentence.'];
    const articleTopics = [
      { name: 'Selected topic', sentences: [2] },
      { name: 'Read topic', sentences: [3] }
    ];

    const { container, unmount } = render(
      <TextDisplay
        sentences={sentences}
        selectedTopics={[{ name: 'Selected topic' }]}
        hoveredTopic={null}
        readTopics={new Set(['Read topic'])}
        articleTopics={articleTopics}
        articleIndex={0}
        paragraphMap={null}
        rawHtml={`<p>First sentence. <script>alert(1)</script><style>p{}</style><iframe src="/x"></iframe><strong>Second sentence.</strong> Third sentence.</p>`}
      />
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('style')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();

    const second = container.querySelector('[data-sentence-index="1"]');
    const third = container.querySelector('[data-sentence-index="2"]');

    expect(second).not.toBeNull();
    expect(second.className).toContain('highlighted');
    expect(third).not.toBeNull();
    expect(third.className).toContain('faded');
    unmount();
  });

  it('keeps plain sentence rendering path with sanitization', () => {
    const { container, unmount } = render(
      <TextDisplay
        sentences={['Hello <strong>world</strong>.', 'Bad <script>alert(1)</script> sentence.']}
        selectedTopics={[]}
        hoveredTopic={null}
        readTopics={new Set()}
        articleTopics={[]}
        articleIndex={1}
        paragraphMap={null}
        rawHtml=""
      />
    );

    expect(container.querySelectorAll('.sentence-token').length).toBe(2);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('Hello world.');
    expect(container.textContent).toMatch(/Bad\s+sentence\./);
    unmount();
  });
});
