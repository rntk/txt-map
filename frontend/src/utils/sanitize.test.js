import { sanitizeHTML } from './sanitize';

describe('sanitizeHTML', () => {
  it('removes blocked tags like script/style/iframe', () => {
    const input = `
      <div>
        <p>Hello</p>
        <script>alert(1)</script>
        <style>body { color: red; }</style>
        <iframe src="https://example.com"></iframe>
      </div>
    `;

    const output = sanitizeHTML(input);
    const root = document.createElement('div');
    root.innerHTML = output;

    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('style')).toBeNull();
    expect(root.querySelector('iframe')).toBeNull();
    expect(root.textContent).toContain('Hello');
  });

  it('removes unsafe event handlers and javascript urls', () => {
    const input = `<a href="javascript:alert(1)" onclick="alert(2)">Link</a>`;
    const output = sanitizeHTML(input);
    const root = document.createElement('div');
    root.innerHTML = output;
    const link = root.querySelector('a');

    expect(link).not.toBeNull();
    expect(link.getAttribute('onclick')).toBeNull();
    expect(link.getAttribute('href')).toBeNull();
  });
});
