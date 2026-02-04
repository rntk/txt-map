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
    return v.startsWith('javascript:') || v.startsWith('data:') || v.startsWith('vbscript:');
  };

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
  // TreeWalker starts at the root (DocumentFragment), which has no attributes.
  let node = walker.nextNode();
  while (node) {
    const allowedAttrs = new Set(['href', 'src', 'alt', 'title', 'class', 'id', 'rel', 'target', 'aria-label', 'role', 'width', 'height']);
    Array.from(node.attributes || []).forEach(attr => {
      const name = attr.name.toLowerCase();
      const val = attr.value;
      if (name.startsWith('on') || name === 'style') {
        node.removeAttribute(attr.name);
        return;
      }
      if (!allowedAttrs.has(name)) {
        node.removeAttribute(attr.name);
        return;
      }
      if ((name === 'href' || name === 'src') && isUnsafeUrl(val)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (name === 'target' && val === '_blank') {
        const rel = node.getAttribute('rel') || '';
        const needed = ['noopener', 'noreferrer'];
        const current = new Set(rel.split(/\s+/).filter(Boolean));
        needed.forEach(n => current.add(n));
        node.setAttribute('rel', Array.from(current).join(' '));
      }
    });
    node = walker.nextNode();
  }

  return template.innerHTML;
}
