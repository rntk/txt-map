// Minimal HTML sanitizer to render article HTML safely without external deps.
// Removes dangerous tags and attributes while preserving common formatting.

// --- Style normalization helpers ---

// Parse a CSS length value into { num, unit }. Returns null if unparseable.
function parseCSSLength(val) {
  const m = String(val).trim().match(/^(-?[\d.]+)(px|em|rem|%)?$/);
  if (!m) return null;
  return { num: parseFloat(m[1]), unit: m[2] || 'px' };
}

// Clamp a CSS length value string to [min, max] in the same unit.
// Only clamps px values; passes through other units unchanged.
function clampPx(val, min, max) {
  const parsed = parseCSSLength(val);
  if (!parsed || parsed.unit !== 'px') return val;
  if (parsed.num < min) return `${min}px`;
  if (parsed.num > max) return `${max}px`;
  return val;
}

// Strip if negative, otherwise clamp px to max. Passes non-px through.
function clampPxPositive(val, max) {
  const parsed = parseCSSLength(val);
  if (!parsed || parsed.unit !== 'px') return val;
  if (parsed.num < 0) return null;
  if (parsed.num > max) return `${max}px`;
  return val;
}

// Clamp unitless line-height numbers; pass px through clampPx.
function clampLineHeight(val) {
  const str = String(val).trim();
  // unitless number (e.g. "1.5")
  const unitless = parseFloat(str);
  if (!isNaN(unitless) && String(unitless) === str) {
    return String(Math.min(3.0, Math.max(1.0, unitless)));
  }
  // px value
  if (str.endsWith('px')) return clampPx(str, 14, 48);
  return val;
}

// Returns true if the color is near-white (luminance > 0.93).
// Handles rgb() and rgba() which is what getComputedStyle always returns.
function isNearWhite(colorStr) {
  const m = String(colorStr).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!m) return false;
  const r = parseFloat(m[1]), g = parseFloat(m[2]), b = parseFloat(m[3]);
  const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  return luminance > 0.93;
}

// Extracts the generic font family keyword from a font stack.
// "Helvetica Neue, Arial, sans-serif" → "sans-serif". Returns null if none found.
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);
function extractGenericFamily(val) {
  const parts = String(val).split(',');
  for (let i = parts.length - 1; i >= 0; i--) {
    const family = parts[i].trim().replace(/['"]/g, '').toLowerCase();
    if (GENERIC_FAMILIES.has(family)) return family;
  }
  return null;
}

const SAFE_DISPLAY = new Set(['block', 'inline', 'inline-block', 'list-item', 'none', 'table', 'table-row', 'table-cell', 'table-caption']);
const SAFE_WHITESPACE = new Set(['normal', 'pre', 'pre-wrap', 'pre-line']);

// Map of CSS property → handler(value) → transformed value string | null (strip)
const styleHandlers = {
  // Keep as-is
  'font-weight':        (v) => v,
  'font-style':         (v) => v,
  'text-decoration':    (v) => v,
  'text-decoration-line': (v) => v,
  'text-transform':     (v) => v,
  'text-align':         (v) => v,
  'letter-spacing':     (v) => v,
  'word-spacing':       (v) => v,
  'list-style-type':    (v) => v,
  'border-collapse':    (v) => v,
  'vertical-align':     (v) => v,
  'border-radius':      (v) => v,
  // Special handling
  'color':              (v) => isNearWhite(v) ? null : v,
  'background-color':   () => null,
  'font-family':        (v) => extractGenericFamily(v),
  // Clamp to safe range (px)
  'font-size':          (v) => clampPx(v, 10, 36),
  'line-height':        (v) => clampLineHeight(v),
  'text-indent':        (v) => clampPxPositive(v, 80),
  'margin-top':         (v) => clampPxPositive(v, 32),
  'margin-bottom':      (v) => clampPxPositive(v, 32),
  'padding-top':        (v) => clampPxPositive(v, 24),
  'padding-bottom':     (v) => clampPxPositive(v, 24),
  'padding-left':       (v) => clampPxPositive(v, 40),
  'padding-right':      (v) => clampPxPositive(v, 40),
  // Filter by value
  'display':            (v) => SAFE_DISPLAY.has(v.toLowerCase()) ? v : null,
  'white-space':        (v) => SAFE_WHITESPACE.has(v.toLowerCase()) ? v : null,
  // Strip entirely: width, max-width, height, max-height, min-width, min-height,
  //   margin-left, margin-right, border-top/bottom/left/right, border, margin, padding,
  //   list-style, border-color, border-width, border-style
};

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
        if (
          lowerVal.includes('expression(') ||
          lowerVal.includes(`java${'script:'}`) ||
          lowerVal.includes('@import') ||
          lowerVal.includes('url(')
        ) {
          return '';
        }
        const handler = styleHandlers[prop];
        if (!handler) return '';
        const result = handler(val);
        if (result === null) return '';
        return `${prop}: ${result}`;
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
      if (name.startsWith('data-')) {
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
