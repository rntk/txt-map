const IMAGE_ANCHOR_CONTEXT_CHARS = 160;

const HTML_FLOW_BLOCK_TAGS = new Set([
  "article",
  "aside",
  "blockquote",
  "br",
  "caption",
  "dd",
  "div",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "td",
  "th",
  "tr",
  "ul",
]);

/**
 * @typedef {{
 *   src: string,
 *   alt: string,
 *   title?: string,
 *   anchorOffset: number,
 * }} ArticleImage
 */

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isSafeImageSrc(value) {
  const src = String(value || "").trim();
  if (!src) return false;
  if (
    /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)
  ) {
    return true;
  }
  if (/^https?:\/\//i.test(src) || /^\/\//.test(src)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false;
  if (src.startsWith("\\") || src.startsWith("?") || src.startsWith("#")) {
    return false;
  }
  return true;
}

/**
 * @param {string} rawSrc
 * @param {string} sourceUrl
 * @returns {string}
 */
function resolveArticleImageSrc(rawSrc, sourceUrl) {
  const src = String(rawSrc || "").trim();
  if (!src || src.startsWith("data:")) return src;
  try {
    if (sourceUrl) {
      return new URL(src, sourceUrl).toString();
    }
    if (src.startsWith("//")) {
      return `${window.location.protocol}${src}`;
    }
  } catch {
    return src;
  }
  return src;
}

/**
 * @param {string} srcset
 * @returns {string}
 */
function getFirstSrcsetUrl(srcset) {
  return (
    String(srcset || "")
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .find(Boolean) || ""
  );
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeArticleText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} text
 * @returns {{text: string, offsets: number[]}}
 */
function buildNormalizedTextOffsetMap(text) {
  let normalized = "";
  /** @type {number[]} */
  const offsets = [];
  let pendingSpaceOffset = null;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (normalized.length > 0) {
        pendingSpaceOffset = pendingSpaceOffset ?? index;
      }
      continue;
    }
    if (pendingSpaceOffset !== null) {
      normalized += " ";
      offsets.push(pendingSpaceOffset);
      pendingSpaceOffset = null;
    }
    normalized += char;
    offsets.push(index);
  }

  return { text: normalized.trimEnd(), offsets };
}

/**
 * @param {{text: string, offsets: number[]}} normalizedArticle
 * @param {number} normalizedEnd
 * @returns {number}
 */
export function getDisplayOffsetAfterNormalizedIndex(
  normalizedArticle,
  normalizedEnd,
) {
  if (normalizedEnd <= 0) return 0;
  const previousOffset =
    normalizedArticle.offsets[
      Math.min(normalizedEnd - 1, normalizedArticle.offsets.length - 1)
    ] ?? 0;
  return previousOffset + 1;
}

/**
 * @param {{text: string, offsets: number[]}} normalizedArticle
 * @param {number} normalizedStart
 * @returns {number}
 */
function getDisplayOffsetAtNormalizedIndex(normalizedArticle, normalizedStart) {
  return normalizedArticle.offsets[Math.max(0, normalizedStart)] ?? 0;
}

/**
 * @param {string} textBeforeImage
 * @param {string} textAfterImage
 * @param {{text: string, offsets: number[]}} normalizedArticle
 * @param {number} articleTextLength
 * @returns {number | null}
 */
function getImageAnchorOffset(
  textBeforeImage,
  textAfterImage,
  normalizedArticle,
  articleTextLength,
) {
  const normalizedBefore = normalizeArticleText(textBeforeImage);
  const normalizedAfter = normalizeArticleText(textAfterImage);

  if (normalizedBefore) {
    let normalizedEnd = normalizedArticle.text.indexOf(normalizedBefore);
    if (normalizedEnd !== -1) {
      normalizedEnd += normalizedBefore.length;
      return getDisplayOffsetAfterNormalizedIndex(
        normalizedArticle,
        normalizedEnd,
      );
    }

    const suffix = normalizedBefore.slice(
      Math.max(0, normalizedBefore.length - IMAGE_ANCHOR_CONTEXT_CHARS),
    );
    const suffixIndex = normalizedArticle.text.indexOf(suffix);
    if (suffixIndex !== -1) {
      return getDisplayOffsetAfterNormalizedIndex(
        normalizedArticle,
        suffixIndex + suffix.length,
      );
    }
  }

  if (normalizedAfter) {
    let normalizedStart = normalizedArticle.text.indexOf(normalizedAfter);
    if (normalizedStart !== -1) {
      return getDisplayOffsetAtNormalizedIndex(
        normalizedArticle,
        normalizedStart,
      );
    }

    const prefix = normalizedAfter.slice(0, IMAGE_ANCHOR_CONTEXT_CHARS);
    const prefixIndex = normalizedArticle.text.indexOf(prefix);
    if (prefixIndex !== -1) {
      return getDisplayOffsetAtNormalizedIndex(normalizedArticle, prefixIndex);
    }
  }

  return normalizedBefore ? articleTextLength : null;
}

/**
 * @param {string} html
 * @param {string} sourceUrl
 * @param {string} articleText
 * @returns {ArticleImage[]}
 */
export function extractArticleImages(html, sourceUrl, articleText) {
  if (!html || typeof document === "undefined") return [];
  const template = document.createElement("template");
  template.innerHTML = html;
  const seen = new Set();
  const normalizedArticle = buildNormalizedTextOffsetMap(articleText);
  /** @type {ArticleImage[]} */
  const images = [];
  /** @type {({type: "text", text: string} | {type: "image", element: Element})[]} */
  const tokens = [];

  const pushTextToken = (text) => {
    if (!text) return;
    const previous = tokens[tokens.length - 1];
    if (previous?.type === "text") {
      previous.text += text;
    } else {
      tokens.push({ type: "text", text });
    }
  };

  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushTextToken(node.nodeValue || "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node;
    const tagName = element.tagName?.toLowerCase() || "";
    if (tagName === "img") {
      tokens.push({ type: "image", element });
      return;
    }
    if (tagName === "br") {
      pushTextToken(" ");
      return;
    }

    const isBlock = HTML_FLOW_BLOCK_TAGS.has(tagName);
    if (isBlock) pushTextToken(" ");
    Array.from(element.childNodes || []).forEach(visit);
    if (isBlock) pushTextToken(" ");
  };

  Array.from(template.content.childNodes).forEach(visit);
  let textBeforeImage = "";
  tokens.forEach((token, index) => {
    if (token.type === "text") {
      textBeforeImage += token.text;
      return;
    }

    const element = token.element;
    const rawSrc =
      element.getAttribute("src") ||
      getFirstSrcsetUrl(element.getAttribute("srcset") || "");
    if (!isSafeImageSrc(rawSrc)) return;
    const src = resolveArticleImageSrc(rawSrc, sourceUrl);
    if (!isSafeImageSrc(src) || seen.has(src)) return;

    const textAfterImage = tokens
      .slice(index + 1)
      .map((candidate) => (candidate.type === "text" ? candidate.text : ""))
      .join("");
    const anchorOffset = getImageAnchorOffset(
      textBeforeImage,
      textAfterImage,
      normalizedArticle,
      articleText.length,
    );
    if (anchorOffset === null) return;

    seen.add(src);
    images.push({
      src,
      alt: element.getAttribute("alt") || "",
      title: element.getAttribute("title") || undefined,
      anchorOffset,
    });
  });
  return images.sort((left, right) => left.anchorOffset - right.anchorOffset);
}
