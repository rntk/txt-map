// Minimal HTML sanitizer to render article HTML safely without external deps.
// Removes dangerous tags and attributes while preserving common formatting.
export function sanitizeHTML(html) {
  if (!html || typeof document === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = html;

  const blockedTags = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'svg',
    'form', 'input', 'button'
  ]);

  // Remove all blocked tags
  blockedTags.forEach(tag => {
    template.content.querySelectorAll(tag).forEach(el => el.remove());
  });

  const isUnsafeUrl = (val) => {
    if (!val) return false;
    const v = String(val).trim().toLowerCase();
    const jsProto = `java${'script:'}`;
    const vbsProto = `vb${'script:'}`;
    return v.startsWith(jsProto) || v.startsWith('data:') || v.startsWith(vbsProto);
  };

  const allowedStyleProps = new Set([
    'color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-transform',
    'font-size', 'font-family', 'line-height', 'letter-spacing', 'word-spacing', 'text-align',
    'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
    'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
    'border', 'border-left', 'border-right', 'border-top', 'border-bottom', 'border-color',
    'border-width', 'border-style', 'border-radius', 'display', 'width', 'height', 'max-width',
    'min-width', 'max-height', 'min-height', 'white-space'
  ]);

  const sanitizeStyle = (styleValue) => {
    if (!styleValue) return '';
    return String(styleValue)
      .split(';')
      .map((decl) => decl.trim())
      .filter(Boolean)
      .map((decl) => {
        const splitIdx = decl.indexOf(':');
        if (splitIdx <= 0) return '';
        const prop = decl.slice(0, splitIdx).trim().toLowerCase();
        const val = decl.slice(splitIdx + 1).trim();
        const lowerVal = val.toLowerCase();
        if (!allowedStyleProps.has(prop)) return '';
        if (
          lowerVal.includes('expression(') ||
          lowerVal.includes(`java${'script:'}`) ||
          lowerVal.includes('@import') ||
          lowerVal.includes('url(')
        ) {
          return '';
        }
        return `${prop}: ${val}`;
      })
      .filter(Boolean)
      .join('; ');
  };

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
  // TreeWalker starts at the root (DocumentFragment), which has no attributes.
  let node = walker.nextNode();
  while (node) {
    const allowedAttrs = new Set(['href', 'src', 'alt', 'title', 'class', 'id', 'rel', 'target', 'aria-label', 'role', 'width', 'height', 'style']);
    const attrs = Array.from(node.attributes || []);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const val = attr.value;
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        continue;
      }
      if (!allowedAttrs.has(name)) {
        node.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'src') && isUnsafeUrl(val)) {
        node.removeAttribute(attr.name);
        continue;
      }
      if (name === 'style') {
        const safeStyle = sanitizeStyle(val);
        if (!safeStyle) {
          node.removeAttribute(attr.name);
        } else {
          node.setAttribute('style', safeStyle);
        }
        continue;
      }
      if (name === 'target' && val === '_blank') {
        const rel = node.getAttribute('rel') || '';
        const needed = ['noopener', 'noreferrer'];
        const current = new Set(rel.split(/\s+/).filter(Boolean));
        needed.forEach(n => current.add(n));
        node.setAttribute('rel', Array.from(current).join(' '));
      }
    }
    node = walker.nextNode();
  }

  return template.innerHTML;
}
